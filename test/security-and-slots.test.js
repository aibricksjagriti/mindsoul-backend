import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { buildSlotPlan, buildCounsellorSlotPlan } from "../src/timeslots/slotPlan.timeslots.js";
import { toDateTime, indiaDateString } from "../src/timeslots/slotUtils.timeslots.js";
import { logout } from "../src/controllers/logout.controllers.js";

async function load(relative, mocks) {
  const module = new SourceTextModule(await readFile(new URL(relative, import.meta.url), "utf8"));
  await module.link((name) => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    const exports = mocks[name];
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}

const response = () => ({
  code: 200, status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});

test("counsellor mutations reject users and other counsellors, allow owner/admin", async () => {
  const { requireCounsellorOwner } = await load("../src/middlewares/counsellorAccess.middlewares.js", {
    "../config/firebase.js": { db: {} },
  });
  for (const user of [undefined, { role: "user" }, { role: "counsellor", counsellorId: "other" }]) {
    let passed = false;
    const res = response();
    requireCounsellorOwner({ user, params: { counsellorId: "owner" } }, res, () => { passed = true; });
    assert.equal(passed, false);
    assert.equal(res.code, user ? 403 : 401);
  }
  for (const user of [{ role: "admin" }, { role: "counsellor", counsellorId: "owner" }]) {
    let passed = false;
    requireCounsellorOwner({ user, params: {}, body: { counsellorId: "owner" } }, response(), () => { passed = true; });
    assert.equal(passed, true);
  }
});

test("profile updates cannot replace login email and safely fill an omitted email", async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ email: "Owner@Example.com" }) }) }) }) };
  const { preserveCounsellorEmail } = await load("../src/middlewares/counsellorAccess.middlewares.js", {
    "../config/firebase.js": { db },
  });
  const res = response();
  let passed = false;
  await preserveCounsellorEmail({ body: { counsellorId: "owner", email: "attacker@example.com" } }, res, () => { passed = true; });
  assert.equal(res.code, 400);
  assert.equal(passed, false);
  const req = { body: { counsellorId: "owner" } };
  await preserveCounsellorEmail(req, response(), () => { passed = true; });
  assert.equal(req.body.email, "owner@example.com");
  assert.equal(passed, true);
});

test("logout clears the same secure cross-site cookie used at login", () => {
  let cleared;
  const res = response();
  res.clearCookie = (name, options) => { cleared = { name, options }; };
  logout({}, res);
  assert.equal(cleared.name, "mindsoul_token");
  assert.deepEqual(cleared.options, { httpOnly: true, secure: true, sameSite: "None", path: "/" });
  assert.equal(res.body.success, true);
});

const configuration = { counsellorId: "c", date: "2030-01-01", workingHours: { morning: { start: "09:00", end: "11:00" } }, slotDuration: 30 };

function fakeDatabase(initial, beforeCommit) {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]));
  let version = 0;
  let attempts = 0;
  let counsellor = null;
  const db = {
    rows, get attempts() { return attempts; },
    setCounsellor(data) { counsellor = data; },
    collection: () => ({ where() { return this; }, doc: (id) => ({ id }) }),
    async runTransaction(callback) {
      for (let retry = 0; retry < 3; retry++) {
        attempts++;
        const readVersion = version;
        const operations = [];
        const transaction = {
          get: async (ref) => ref.id === "c"
            ? { exists: !!counsellor, data: () => counsellor }
            : { docs: [...rows].map(([id, row]) => ({ id, ref: { id }, data: () => ({ ...row }) })) },
          delete: (ref) => operations.push(() => rows.delete(ref.id)),
          update: (ref, data) => operations.push(() => rows.set(ref.id, { ...rows.get(ref.id), ...data })),
          create: (ref, data) => operations.push(() => { assert.equal(rows.has(ref.id), false); rows.set(ref.id, data); }),
        };
        const result = await callback(transaction);
        if (beforeCommit && retry === 0) { beforeCommit(rows); version++; }
        if (readVersion !== version) continue;
        for (const operation of operations) operation();
        version++;
        return result;
      }
      throw new Error("Transaction retries exhausted");
    },
  };
  return db;
}

async function generator(db) {
  const firestore = Object.assign(() => db, {
    Timestamp: { fromDate: (date) => date }, FieldValue: { serverTimestamp: () => "server-time" },
  });
  return load("../src/timeslots/slotGenerator.timeslots.js", {
    "firebase-admin": { default: { firestore } },
    "./slotPlan.timeslots.js": { buildSlotPlan, buildCounsellorSlotPlan, slotsOverlap: (a, b) => a.startTime < b.endTime && b.startTime < a.endTime },
  });
}

test("partial schedule changes remove obsolete slots but preserve booked slots", async () => {
  const db = fakeDatabase([
    { id: "old-evening", startTime: "18:00", endTime: "18:30", isBooked: false },
    { id: "booked-evening", startTime: "19:00", endTime: "19:30", isBooked: true, bookedBy: "student" },
  ]);
  const { generateSlotsForDate } = await generator(db);
  const result = await generateSlotsForDate(configuration);
  assert.equal(result.deleted, 1);
  assert.equal(db.rows.has("old-evening"), false);
  assert.equal(db.rows.get("booked-evening").bookedBy, "student");
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.created, 3);
});

test("a reservation made during refresh survives a transaction retry", async () => {
  const id = "obsolete-slot";
  const db = fakeDatabase([{ id, startTime: "18:00", endTime: "18:30", isBooked: false }], (rows) => {
    rows.set(id, { ...rows.get(id), isBooked: true, bookedBy: "student" });
  });
  const { generateSlotsForDate } = await generator(db);
  await generateSlotsForDate(configuration);
  assert.equal(db.attempts, 2);
  assert.equal(db.rows.get(id).isBooked, true);
  assert.equal(db.rows.get(id).bookedBy, "student");
});

test("changed slot durations cannot create availability overlapping a reservation", async () => {
  const db = fakeDatabase([{ id: "existing-booking", startTime: "09:15", endTime: "10:15", isBooked: true }]);
  const { generateSlotsForDate } = await generator(db);
  await generateSlotsForDate(configuration);
  assert.equal(db.rows.has("c_2030-01-01_morning_09:00"), false);
  assert.equal(db.rows.has("c_2030-01-01_morning_09:45"), false);
  assert.equal(db.rows.has("c_2030-01-01_morning_10:30"), true);
});

test("refresh is idempotent and updates unbooked duration without resetting ownership", async () => {
  const plan = buildSlotPlan(configuration);
  const db = fakeDatabase([{ ...plan[0], endTime: "09:20", isBooked: false }]);
  const { generateSlotsForDate } = await generator(db);
  await generateSlotsForDate(configuration);
  assert.equal(db.rows.get(plan[0].id).endTime, "09:30");
  assert.equal((await generateSlotsForDate(configuration)).created, 0);
  assert.equal(db.rows.size, 3);
});

test("invalid configuration and database errors fail instead of reporting success", async () => {
  assert.throws(() => buildSlotPlan({ ...configuration, slotDuration: -15 }));
  assert.throws(() => buildSlotPlan({ ...configuration, date: "2030-02-30" }));
  assert.throws(() => buildSlotPlan({ ...configuration, workingHours: { morning: { start: "25:00", end: "26:00" } } }));
  const { generateSlotsForDate } = await generator({ runTransaction: async () => { throw new Error("write failed"); }, collection: () => ({ where() { return this; } }) });
  await assert.rejects(generateSlotsForDate(configuration), /write failed/);
});

test("Indian dates and time instants do not depend on host timezone", () => {
  assert.equal(toDateTime("2030-01-01", "09:00").toISOString(), "2030-01-01T03:30:00.000Z");
  assert.equal(indiaDateString(new Date("2026-10-05T22:30:00Z")), "2026-10-06");
});

test("refresh retries against the latest schedule instead of recreating disabled periods", async () => {
  const profile = { workingHours: configuration.workingHours, slotDuration: 30 };
  const db = fakeDatabase([], () => {
    db.setCounsellor({ profileData: profile, weeklySchedule: { Tuesday: { morning: false } } });
  });
  db.setCounsellor({ profileData: profile, weeklySchedule: { Tuesday: { morning: true } } });
  const { generateSlotsForDate } = await generator(db);
  const result = await generateSlotsForDate({ counsellorId: "c", date: "2030-01-01", useCounsellorSchedule: true });
  assert.equal(db.attempts, 2);
  assert.equal(result.created, 0);
  assert.equal(db.rows.size, 0);
});

test("day-off exceptions preserve reservations while removing all unbooked availability", async () => {
  const plan = buildSlotPlan(configuration);
  const db = fakeDatabase([{ ...plan[0], isBooked: true, bookedBy: "student" }, { ...plan[1], isBooked: false }]);
  db.setCounsellor({
    profileData: { workingHours: configuration.workingHours, slotDuration: 30 },
    weeklySchedule: { Tuesday: { morning: true } },
    scheduleExceptions: { "2030-01-01": { off: true } },
  });
  const { generateSlotsForDate } = await generator(db);
  await generateSlotsForDate({ counsellorId: "c", date: "2030-01-01", useCounsellorSchedule: true });
  assert.equal(db.rows.size, 1);
  assert.equal(db.rows.get(plan[0].id).bookedBy, "student");
});
