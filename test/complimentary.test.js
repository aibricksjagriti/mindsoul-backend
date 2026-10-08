import test from "node:test";
import assert from "node:assert/strict";
import { createComplimentaryBookingService } from "../src/services/complimentaryBooking.service.js";

const DELETE = Symbol("delete");
class Store {
  rows = new Map();
  tail = Promise.resolve();
  calls = 0;
  failFinal = false;
  collection(path) {
    const store = this;
    const query = (filters = []) => ({
      where(field, operator, value) { return query([...filters, [field, operator, value]]); },
      async get() {
        const docs = [...store.rows].filter(([key, row]) => key.startsWith(path + "/") && key.split("/").length === path.split("/").length + 1 && filters.every(([field, operator, value]) => operator === "==" && row[field] === value)).map(([key]) => store.ref(key).snapshot());
        return { docs, empty: !docs.length };
      },
      doc(id) { return store.ref(path + "/" + id); },
    });
    return query();
  }
  ref(path) {
    const store = this;
    return {
      path, id: path.split("/").at(-1), collection(name) { return store.collection(path + "/" + name); },
      snapshot() { return { exists: store.rows.has(path), id: path.split("/").at(-1), ref: this, data: () => store.rows.has(path) ? { ...store.rows.get(path) } : undefined }; },
      async get() { return this.snapshot(); },
    };
  }
  async runTransaction(callback) {
    const previous = this.tail;
    let unlock;
    this.tail = new Promise((resolve) => { unlock = resolve; });
    await previous;
    this.calls++;
    const writes = [];
    const transaction = {
      get: (ref) => ref.get(),
      set: (ref, value) => writes.push(() => this.rows.set(ref.path, { ...value })),
      update: (ref, value) => writes.push(() => {
        assert.ok(this.rows.has(ref.path));
        const row = { ...this.rows.get(ref.path) };
        for (const [key, field] of Object.entries(value)) { if (field === DELETE) delete row[key]; else row[key] = field; }
        this.rows.set(ref.path, row);
      }),
    };
    try {
      const result = await callback(transaction);
      if (this.failFinal && this.calls === 2) throw new Error("Simulated final write failure");
      for (const write of writes) write();
      return result;
    } finally { unlock(); }
  }
}

const user = { uid: "free-user", role: "user", email: "free@example.invalid" };
const input = { counsellorId: "c", date: "2030-01-01", timeSlot: "09:00-10:00", requestId: "request-0000000000001" };
const slotPath = "timeSlots/slot";
function setup(overrides = {}) {
  const db = new Store();
  db.rows.set("users/free-user", { name: "Free User", email: user.email });
  db.rows.set("complimentaryAccess/free-user", { active: true, allowance: "unlimited" });
  db.rows.set("counsellors/c", { isVerified: true, profileCompleted: true, profileData: { firstName: "Counsellor", sessionPrice: 1500 } });
  db.rows.set(slotPath, { counsellorId: "c", date: input.date, startTime: "09:00", endTime: "10:00", isBooked: false });
  let meetings = 0, deleted = 0;
  let clock = Date.parse("2029-12-01T00:00:00Z");
  const service = createComplimentaryBookingService({
    db, fieldValue: { serverTimestamp: () => "server-time", delete: () => DELETE }, now: () => clock,
    createMeeting: async () => ({ id: String(++meetings), joinUrl: "https://zoom.us/j/preview", startUrl: "HOST-SECRET" }),
    deleteMeeting: async () => { deleted++; }, ...overrides,
  });
  return { db, service, advance: (milliseconds) => { clock += milliseconds; }, meetings: () => meetings, deleted: () => deleted };
}

test("approved user gets a scheduled zero-cost session with all dashboard mirrors and no payment records", async () => {
  const { service, db } = setup();
  const booking = await service.book(user, input);
  assert.equal(booking.status, "scheduled");
  assert.equal(booking.amount, 0);
  assert.equal(booking.bookingType, "complimentary");
  assert.equal(db.rows.get(`users/free-user/appointments/${booking.id}`).status, "scheduled");
  assert.equal(db.rows.get(`counsellors/c/appointments/${booking.id}`).status, "scheduled");
  assert.equal(db.rows.get(slotPath).bookedAppointmentId, booking.id);
  assert.equal([...db.rows.keys()].some((key) => key.startsWith("payments/")), false);
  assert.equal(JSON.stringify([...db.rows]).includes("HOST-SECRET"), false);
});

test("normal users, counsellors and revoked accounts cannot enable free bookings through request fields", async () => {
  const { service, db } = setup();
  await assert.rejects(service.book({ ...user, uid: "normal-user" }, { ...input, eligible: true, amount: 0 }), { statusCode: 403 });
  await assert.rejects(service.book({ ...user, role: "counsellor" }, input), { statusCode: 403 });
  db.rows.set("complimentaryAccess/free-user", { active: false, allowance: "unlimited" });
  await assert.rejects(service.book(user, input), { statusCode: 403 });
  assert.equal(db.rows.get(slotPath).isBooked, false);
});

test("replaying a completed request does not create another appointment or Zoom meeting", async () => {
  const fixture = setup();
  const first = await fixture.service.book(user, input);
  const replay = await fixture.service.book(user, input);
  assert.equal(first.id, replay.id);
  assert.equal(fixture.meetings(), 1);
});

test("simultaneous bookings cannot reserve the same slot twice", async () => {
  let started, finish;
  const waiting = new Promise((resolve) => { started = resolve; });
  const meeting = new Promise((resolve) => { finish = resolve; });
  const fixture = setup({ createMeeting: async () => { started(); return meeting; } });
  const first = fixture.service.book(user, input);
  await waiting;
  await assert.rejects(fixture.service.book(user, { ...input, requestId: "request-0000000000002" }), { statusCode: 409 });
  finish({ id: "1", joinUrl: "https://zoom.us/j/preview" });
  assert.equal((await first).status, "scheduled");
});

test("invalid duration and past dates are rejected before reservation", async () => {
  const fixture = setup();
  await assert.rejects(fixture.service.book(user, { ...input, timeSlot: "09:00-11:00" }), { statusCode: 409 });
  await assert.rejects(fixture.service.book(user, { ...input, date: "2020-01-01" }), { statusCode: 400 });
  assert.equal(fixture.meetings(), 0);
});

test("Zoom failure releases only this request's reservation and records a recoverable failure", async () => {
  const fixture = setup({ createMeeting: async () => { throw new Error("Zoom unavailable"); } });
  await assert.rejects(fixture.service.book(user, input), { statusCode: 502 });
  assert.equal(fixture.db.rows.get(slotPath).isBooked, false);
  assert.equal(fixture.db.rows.get(slotPath).bookedAppointmentId, undefined);
  assert.equal([...fixture.db.rows].find(([key]) => key.startsWith("appointments/"))[1].status, "booking_failed");
});

test("final write failure deletes the orphan meeting and releases the reservation", async () => {
  const fixture = setup();
  fixture.db.failFinal = true;
  await assert.rejects(fixture.service.book(user, input), /Simulated final write failure/);
  assert.equal(fixture.db.rows.get(slotPath).isBooked, false);
  assert.equal(fixture.deleted(), 1);
});

test("unlimited access supports a second distinct session without consuming an allowance", async () => {
  const fixture = setup();
  fixture.db.rows.set("timeSlots/second", { counsellorId: "c", date: input.date, startTime: "11:00", endTime: "12:00", isBooked: false });
  const first = await fixture.service.book(user, input);
  const second = await fixture.service.book(user, { ...input, timeSlot: "11:00-12:00", requestId: "request-0000000000002" });
  assert.notEqual(first.id, second.id);
  assert.equal(second.amount, 0);
  assert.equal((await fixture.service.eligibility(user)).eligible, true);
});
