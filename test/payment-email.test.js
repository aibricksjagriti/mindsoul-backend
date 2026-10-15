import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { createBookingNotifications } from "../src/services/complimentaryNotifications.service.js";
import { createBookingEmailRetry } from "../src/services/bookingEmailRetry.service.js";
import { isDateString, toDateTime } from "../src/timeslots/slotUtils.timeslots.js";

const DELETE = Symbol("delete");
const timestamp = ms => ({ toMillis: () => ms });
const admin = { firestore: { FieldValue: { delete: () => DELETE, serverTimestamp: () => "now" }, Timestamp: { now: () => timestamp(Date.now()), fromDate: date => timestamp(date.getTime()) } } };
class Store {
  rows = new Map(); tail = Promise.resolve(); failCommit = false; beforeTransaction = null;
  collection(path) {
    const store = this;
    const query = (filters = []) => ({
      where: (key, op, value) => query([...filters, [key, op, value]]),
      async get() {
        const docs = [...store.rows].filter(([name, row]) => name.startsWith(path + "/") && name.split("/").length === path.split("/").length + 1 && filters.every(([key, op, value]) => op === "==" ? row[key] === value : op === "in" ? value.includes(row[key]) : op === "<" && row[key]?.toMillis() < value.toMillis())).map(([name]) => store.ref(name).snapshot());
        return { docs, empty: !docs.length };
      },
      limit() { return this; }, doc: id => store.ref(`${path}/${id || "new"}`),
    });
    return query();
  }
  ref(path) {
    const store = this;
    return { path, id: path.split("/").at(-1), collection: name => store.collection(`${path}/${name}`),
      snapshot() { return { exists: store.rows.has(path), id: this.id, ref: this, data: () => store.rows.has(path) ? { ...store.rows.get(path) } : undefined }; },
      async get() { return this.snapshot(); },
      async update(value) { store.write(this, value, true); },
    };
  }
  write(ref, value, merge) {
    const row = merge ? { ...this.rows.get(ref.path) } : {};
    for (const [key, data] of Object.entries(value)) { if (data === DELETE) delete row[key]; else row[key] = data; }
    this.rows.set(ref.path, row);
  }
  async runTransaction(callback) {
    const previous = this.tail; let unlock;
    this.tail = new Promise(resolve => { unlock = resolve; }); await previous;
    try {
      this.beforeTransaction?.(); this.beforeTransaction = null;
      const writes = []; let writing = false;
      const tx = {
        get: ref => { assert.equal(writing, false, "all reads must precede writes"); return ref.get(); },
        update: (ref, value) => { writing = true; writes.push(() => { assert.ok(this.rows.has(ref.path)); this.write(ref, value, true); }); },
        set: (ref, value, options) => { writing = true; writes.push(() => this.write(ref, value, options?.merge)); },
      };
      const result = await callback(tx);
      if (this.failCommit) { this.failCommit = false; throw new Error("Commit failed"); }
      writes.forEach(write => write()); return result;
    } finally { unlock(); }
  }
}
async function load(path, mocks) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), "utf8"));
  await module.link(name => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`);
    const values = mocks[name]; return new SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); });
  });
  await module.evaluate(); return module.namespace;
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });
function fixture() {
  const db = new Store();
  const appointment = { id: "a", studentId: "u", studentEmail: "user@example.invalid", counsellorId: "c", date: "2030-01-01", timeSlot: "09:00-10:00", status: "pending_payment", paymentStatus: "pending", amount: 1500, razorpayOrderId: "order_1", paymentExpiresAt: timestamp(Date.now() + 60000), zoomLink: "https://zoom.us/j/123", ttlDeleteAt: "old-ttl" };
  db.rows.set("appointments/a", appointment);
  db.rows.set("users/u", { email: appointment.studentEmail });
  db.rows.set("counsellors/c", { email: "counsellor@example.invalid" });
  db.rows.set("timeSlots/s", { counsellorId: "c", date: appointment.date, startTime: "09:00", endTime: "10:00", isBooked: true, bookedBy: "u", bookedAppointmentId: "a" });
  const payment = { id: "pay_1", order_id: "order_1", amount: 150000, currency: "INR", status: "captured", notes: { appointmentId: "a" } };
  const order = { id: "order_1", notes: { appointmentId: "a" }, amount: 150000, currency: "INR" };
  const razorpay = { orders: { fetch: async () => order, create: async () => order }, payments: { fetch: async () => payment, capture: async () => {} } };
  return { db, appointment, payment, order, razorpay };
}
const webhookSecret = "isolated-webhook-test-secret";
async function webhook(f, notify = async () => {}) {
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  return (await load("../src/controllers/payment/webhookController.js", { crypto: { default: crypto }, "../../config/firebase.js": { db: f.db }, "firebase-admin": { default: admin }, "../../services/razorpayClient.js": { razorpay: f.razorpay }, "../../services/paidBookingMail.service.js": { notifyPaidBooking: notify } })).razorpayWebhook;
}
const request = (f, event = "payment.captured") => {
  const rawBody = Buffer.from(JSON.stringify({ event, payload: { payment: { entity: f.payment } } }));
  return { rawBody, headers: { "x-razorpay-signature": crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex") } };
};

test("capture atomically updates payment history and appointment mirrors, clears TTL, then awaits email", async () => {
  const f = fixture(); let emailed = false;
  const handle = await webhook(f, async id => { assert.equal(id, "a"); assert.equal(f.db.rows.get("appointments/a").paymentStatus, "success"); assert.ok(f.db.rows.has("payments/pay_1")); emailed = true; });
  const res = response(); await handle(request(f), res);
  assert.equal(res.code, 200); assert.equal(emailed, true);
  for (const path of ["appointments/a", "users/u/appointments/a", "counsellors/c/appointments/a"]) { assert.equal(f.db.rows.get(path).status, "scheduled"); assert.equal(f.db.rows.get(path).ttlDeleteAt, undefined); }
});

test("database failure rolls back all payment writes and webhook retry repairs them", async () => {
  const f = fixture(); f.db.failCommit = true; let calls = 0;
  const handle = await webhook(f, async () => { calls++; }); const first = response(); await handle(request(f), first);
  assert.equal(first.code, 500); assert.equal(f.db.rows.get("appointments/a").paymentStatus, "pending"); assert.equal(f.db.rows.has("payments/pay_1"), false); assert.equal(calls, 0);
  const retry = response(); await handle(request(f), retry); assert.equal(retry.code, 200); assert.equal(calls, 1);
});

test("SMTP failure returns retryable status after capture; replay retries only unaccepted messages", async () => {
  const f = fixture(); let failUser = true; const sent = [];
  const notify = createBookingNotifications({ db: f.db, bookingType: "paid", frontendUrl: "https://www.themindsoul.com", sendMail: async m => { if (failUser && m.to === f.appointment.studentEmail) throw Error("SMTP unavailable"); sent.push(m); return { accepted: [m.to] }; } });
  const handle = await webhook(f, async id => { const results = await notify(id); if (Object.values(results).some(value => value !== "sent")) throw Object.assign(Error("retry"), { statusCode: 503 }); });
  const first = response(); await handle(request(f), first); assert.equal(first.code, 503); assert.equal(sent.length, 2);
  failUser = false; const retry = response(); await handle(request(f), retry); assert.equal(retry.code, 200); assert.equal(sent.length, 4);
  await handle(request(f), response()); assert.equal(sent.length, 4);
  assert.match(sent.find(m => m.to === "counsellor@example.invalid" && !m.subject.includes("receipt")).text, /counsellor-dashboard/);
  assert.match(sent.find(m => m.subject.includes("receipt")).text, /1500.00/);
});

test("signed webhook rejects wrong order, amount and conflicting slot without confirmation", async () => {
  for (const change of [f => { f.payment.order_id = "other"; }, f => { f.payment.amount = 1; }, f => { f.db.rows.get("timeSlots/s").bookedAppointmentId = "other"; }]) {
    const f = fixture(); change(f); let mailed = false; const handle = await webhook(f, async () => { mailed = true; }); const res = response(); await handle(request(f), res);
    assert.ok(res.code >= 400); assert.equal(mailed, false); assert.equal(f.db.rows.get("appointments/a").paymentStatus, "pending");
  }
});

test("webhook accepts appointment notes from order and rejects forged signatures", async () => {
  const f = fixture(); delete f.payment.notes; const handle = await webhook(f); const res = response(); await handle(request(f), res); assert.equal(res.code, 200);
  const bad = request(f); bad.headers["x-razorpay-signature"] = "00".repeat(32); const rejected = response(); await handle(bad, rejected); assert.equal(rejected.code, 400);
});

test("late failed payment event cannot overwrite a captured payment", async () => {
  const f = fixture(); const handle = await webhook(f); await handle(request(f), response()); f.payment.status = "failed";
  await handle(request(f, "payment.failed"), response()); assert.equal(f.db.rows.get("appointments/a").paymentStatus, "success");
});

test("verification binds signature, order, appointment and amount even for already-paid appointments", async () => {
  for (const variant of ["valid", "wrongOrder", "wrongAmount", "paidBadSignature"]) {
    const f = fixture(); process.env.RAZORPAY_KEY_SECRET = "isolated-verification-secret";
    if (variant === "wrongOrder") f.appointment.razorpayOrderId = "other";
    if (variant === "wrongAmount") f.payment.amount = 1;
    if (variant === "paidBadSignature") { f.appointment.paymentStatus = "success"; f.appointment.paymentId = "pay_1"; }
    const { verifyRazorpayPayment } = await load("../src/controllers/payment/verifyPaymentController.js", { crypto: { default: crypto }, "../../config/firebase.js": { db: f.db, adminDb: f.db }, "../../services/razorpayClient.js": { razorpay: f.razorpay } });
    const signature = variant === "paidBadSignature" ? "00".repeat(32) : crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update("order_1|pay_1").digest("hex");
    const res = response(); await verifyRazorpayPayment({ user: { uid: "u", role: "user" }, body: { appointmentId: "a", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: signature } }, res);
    assert.equal(res.code, variant === "valid" ? 200 : 400);
  }
});

test("order creation rejects expired, complimentary, wrong currency and negative amounts", async () => {
  for (const variant of ["valid", "expired", "free", "currency", "negative"]) {
    const f = fixture();
    if (variant === "expired") f.appointment.paymentExpiresAt = timestamp(Date.now() - 1);
    if (variant === "free") f.appointment.bookingType = "complimentary";
    if (variant === "negative") f.appointment.amount = -100;
    const { createRazorpayOrder } = await load("../src/controllers/payment/createOrderController.js", { "../../config/firebase.js": { db: f.db }, "../../services/razorpayClient.js": { razorpay: f.razorpay } });
    const res = response(); await createRazorpayOrder({ user: { uid: "u" }, body: { appointmentId: "a", currency: variant === "currency" ? "USD" : "INR" } }, res);
    assert.equal(res.code, variant === "valid" ? 200 : ["expired", "free"].includes(variant) ? 409 : 400);
  }
});

test("cleanup rereads pending payments transactionally and never overwrites concurrent capture", async () => {
  const f = fixture(); f.appointment.paymentExpiresAt = timestamp(Date.now() - 1000);
  f.db.beforeTransaction = () => { f.appointment.paymentStatus = "success"; f.appointment.status = "scheduled"; };
  const { cleanupExpiredAppointments } = await load("../src/controllers/cleanup.controllers.js", { "firebase-admin": { default: admin }, "../config/firebase.js": { adminDb: f.db } });
  const res = response(); await cleanupExpiredAppointments({}, res);
  assert.equal(res.body.cleaned, 0); assert.equal(f.db.rows.get("timeSlots/s").isBooked, true);
});

test("cleanup releases only matching appointment ownership and updates both dashboard mirrors", async () => {
  for (const owner of ["a", "another"]) {
    const f = fixture(); f.appointment.paymentExpiresAt = timestamp(Date.now() - 1000); f.db.rows.get("timeSlots/s").bookedAppointmentId = owner;
    const { cleanupExpiredAppointments } = await load("../src/controllers/cleanup.controllers.js", { "firebase-admin": { default: admin }, "../config/firebase.js": { adminDb: f.db } });
    const res = response(); await cleanupExpiredAppointments({}, res);
    assert.equal(res.body.cleaned, 1); assert.equal(f.db.rows.get("timeSlots/s").isBooked, owner !== "a");
    assert.equal(f.db.rows.get("users/u/appointments/a").status, "cancelled_expired");
  }
});

test("paid reservation checks latest slot ownership and deletes the losing Zoom meeting", async () => {
  const f = fixture(); f.db.rows.get("timeSlots/s").isBooked = false;
  f.db.rows.get("counsellors/c").isVerified = true; f.db.rows.get("counsellors/c").sessionPrice = 1500;
  let deleted = false; process.env.ZOOM_HOST_EMAIL = "host@example.invalid";
  f.db.beforeTransaction = () => { f.db.rows.get("timeSlots/s").isBooked = true; f.db.rows.get("timeSlots/s").bookedAppointmentId = "winner"; };
  const { createAppointment } = await load("../src/controllers/appointment.controllers.js", {
    "../config/firebase.js": { db: f.db, adminDb: f.db, auth: {} }, "firebase-admin": { default: admin },
    "../services/createZoomMeeting.js": { createZoomMeeting: async () => ({ meetingId: "new-meeting", joinUrl: "https://zoom.us/j/123" }), deleteZoomMeeting: async () => { deleted = true; } },
    "../timeslots/slotUtils.timeslots.js": { isDateString, toDateTime },
  });
  const res = response(); await createAppointment({ user: { uid: "u", role: "user" }, body: { counsellorId: "c", date: "2030-01-01", timeSlot: "09:00-10:00" } }, res);
  assert.equal(res.code, 409); assert.equal(deleted, true); assert.equal(f.db.rows.has("appointments/new"), false); assert.equal(f.db.rows.get("timeSlots/s").bookedAppointmentId, "winner");
});

test("paid Zoom meeting uses IST and actual selected session duration", async () => {
  let payload;
  const { createZoomMeeting } = await load("../src/services/createZoomMeeting.js", { axios: { default: { post: async (url, data) => { payload = data; return { data: { id: 123, join_url: "https://zoom.us/j/123" } }; } } }, "./zoomAuth.js": { getZoomAccessToken: async () => "mock" } });
  await createZoomMeeting("host@example.invalid", "2030-01-01", "09:00-10:00");
  assert.equal(payload.start_time, "2030-01-01T03:30:00.000Z"); assert.equal(payload.duration, 60);
});

test("scheduled retry worker skips live leases, backoff and accepted mail; processes both booking types", async () => {
  const db = new Store();
  for (const [id, record] of Object.entries({ failed: { status: "failed", appointmentId: "free" }, leased: { status: "sending", appointmentId: "leased", leaseUntil: 9999 }, backoff: { status: "failed", appointmentId: "backoff", nextAttemptAt: 9999 }, sent: { status: "sent", appointmentId: "sent" } })) db.rows.set(`complimentaryNotifications/${id}`, record);
  db.rows.set("bookingNotifications/pending", { status: "pending", appointmentId: "paid" });
  const calls = [];
  const run = createBookingEmailRetry({ db, now: () => 1000, notifyFree: async id => { calls.push(id); return { user: "sent", counsellor: "sent" }; }, notifyPaid: async id => { calls.push(id); throw Error("SMTP still unavailable"); } });
  assert.deepEqual(await run(), { processed: 2, completed: 1 }); assert.deepEqual(calls.sort(), ["free", "paid"]);
});

test("legacy partial capture replay repairs payment history before sending email", async () => {
  const f = fixture(); f.appointment.paymentStatus = "success"; f.appointment.status = "scheduled"; f.appointment.paymentId = "pay_1";
  let notified = false; const handle = await webhook(f, async () => { notified = true; assert.ok(f.db.rows.has("payments/pay_1")); });
  const res = response(); await handle(request(f), res); assert.equal(res.code, 200); assert.equal(notified, true); assert.equal(f.db.rows.get("users/u/appointments/a").status, "scheduled");
});

test("counsellor host endpoint rejects nonowners and retrieves a fresh host URL for the assigned counsellor", async () => {
  const f = fixture(); f.appointment.status = "scheduled"; const routes = {}; let calls = 0;
  const router = { get(path, ...handlers) { routes[path] = handlers.at(-1); }, post() {} };
  await load("../src/routes/appointment.routes.js", {
    express: { default: { Router: () => router } },
    "../controllers/appointment.controllers.js": { createAppointment: () => {} },
    "../middlewares/auth.middlewares.js": { authenticate: () => {} },
    "../middlewares/validators.js": { validateCreateAppointment: () => {} },
    "../config/firebase.js": { db: f.db },
    "../services/complimentaryMeeting.service.js": { getComplimentaryHostLink: async id => { assert.equal(id, "123"); calls++; return "https://zoom.us/s/123?zak=mock"; } },
    "../services/paidBookingMail.service.js": { notifyPaidBooking: async () => {} },
  });
  for (const user of [{ role: "user", uid: "u" }, { role: "counsellor", counsellorId: "other" }]) { const res = response(); await routes["/:id/host"]({ user, params: { id: "a" } }, res); assert.equal(res.code, 403); }
  assert.equal(calls, 0); const res = response(); await routes["/:id/host"]({ user: { role: "counsellor", counsellorId: "c" }, params: { id: "a" } }, res); assert.equal(res.code, 200); assert.match(res.body.startUrl, /zak=mock/); assert.equal(calls, 1);
});

test("verification refuses another user's booking even with a valid payment signature", async () => {
  const f = fixture();
  const { verifyRazorpayPayment } = await load("../src/controllers/payment/verifyPaymentController.js", { crypto: { default: crypto }, "../../config/firebase.js": { db: f.db, adminDb: f.db }, "../../services/razorpayClient.js": { razorpay: f.razorpay } });
  const res = response(); await verifyRazorpayPayment({ user: { uid: "other", role: "user" }, body: { appointmentId: "a", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "test" } }, res); assert.equal(res.code, 403);
});

test("expired checkout whose provider order is already paid cannot offer a fresh payment", async () => {
  const f = fixture(); f.appointment.paymentExpiresAt = timestamp(Date.now() - 1000); f.order.status = "paid";
  const { createRazorpayOrder } = await load("../src/controllers/payment/createOrderController.js", { "../../config/firebase.js": { db: f.db }, "../../services/razorpayClient.js": { razorpay: f.razorpay } });
  const res = response(); await createRazorpayOrder({ user: { uid: "u" }, body: { appointmentId: "a" } }, res);
  assert.equal(res.code, 409); assert.equal(res.body.code, "PAYMENT_ALREADY_COMPLETED");
});
