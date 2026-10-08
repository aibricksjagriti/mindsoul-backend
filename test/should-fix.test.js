import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { validateUserProfile } from "../src/middlewares/userProfileValidator.js";
import { validateCounsellorProfile } from "../src/middlewares/counsellorProfileValidator.js";
import { validateQuoteRequest } from "../src/middlewares/validateQuoteRequest.js";
import { escapeHtml } from "../src/utils/escapeHtml.js";
import { indiaDateString, isDateString } from "../src/timeslots/slotUtils.timeslots.js";

async function load(path, mocks) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), "utf8"));
  await module.link((name) => {
    assert.ok(name in mocks, name);
    const values = mocks[name];
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test("malformed user fields fail validation instead of invoking string methods on numbers", () => {
  for (const patch of [{ gender: 1 }, { medications: [42] }, { medicalHistory: {} }, { age: [20] }, { age: "20.5" }, { phone: 1234567890 }]) {
    const res = response();
    let proceeded = false;
    validateUserProfile({ body: { age: "20", gender: "male", phone: "1234567890", ...patch } }, res, () => { proceeded = true; });
    assert.equal(res.code, 400);
    assert.equal(proceeded, false);
  }
  const req = { body: { age: "20", gender: " Female ", phone: "1234567890", medications: [] } };
  validateUserProfile(req, response(), () => {});
  assert.equal(req.body.age, 20);
  assert.equal(req.body.gender, "female");
});

test("singleton multipart working day is normalized and malformed arrays are rejected", () => {
  const req = { body: { workingDays: "Monday", languages: "English", workingHours: '{"morning":{"start":"09:00","end":"12:00"}}' } };
  let proceeded = false;
  validateCounsellorProfile(req, response(), () => { proceeded = true; });
  assert.equal(proceeded, true);
  assert.deepEqual(req.body.workingDays, ["Monday"]);
  for (const body of [{ languages: [1] }, { workingDays: "Someday" }, { workingHours: "null" }, { slotDuration: "2.5" }]) {
    const res = response();
    validateCounsellorProfile({ body }, res, () => assert.fail("Should reject"));
    assert.equal(res.code, 400);
  }
});

function scheduleMocks(db, extras = {}) {
  return {
    "../config/firebase.js": { db },
    "../services/schedule.service.js": { getWeeklySchedule: async () => null, updateWeeklySchedule: async () => ({}), deleteDateException: async () => ({}), getCounsellorTimeConfig: async () => ({}), setDateException: async () => ({}), ...extras },
    "../services/timeslotGenerator.service.js": { generateSmartSlotsForDate: async () => ({ success: true }) },
    "../timeslots/slotUtils.timeslots.js": { indiaDateString, isDateString },
  };
}

test("schedule exceptions return actual nested profile configuration", async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ profileData: { slotDuration: 60, workingHours: { morning: { start: "09:00", end: "12:00" } } }, scheduleExceptions: { "2030-01-01": { off: true } } }) }) }) }) };
  const { getScheduleExceptionInfo } = await load("../src/controllers/schedule.controllers.js", scheduleMocks(db));
  const res = response();
  await getScheduleExceptionInfo({ params: { counsellorId: "c" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.schedule.slotDuration, 60);
  assert.equal(res.body.schedule.workingHours.morning.start, "09:00");
});

test("unbooked slots do not trigger booked-appointment confirmation", async () => {
  const predicates = [];
  const query = { where(...args) { predicates.push(args); return this; }, async get() { return { empty: predicates.some(([key, , value]) => key === "isBooked" && value === true), size: 0 }; } };
  let saved;
  const { addDateException } = await load("../src/controllers/schedule.controllers.js", scheduleMocks({ collection: () => query }, { setDateException: async (...args) => { saved = args; } }));
  const res = response();
  await addDateException({ params: { counsellorId: "c" }, body: { date: "2030-01-01", overrideType: "off" } }, res);
  assert.equal(res.body.success, true);
  assert.equal(saved[2].off, true);
});

test("exception creation, replacement and deletion all operate on the active root map", async () => {
  const deleted = Symbol("delete");
  const account = { scheduleExceptions: {} };
  const ref = { get: async () => ({ exists: true, data: () => account }), async update(path, value) { if (value === deleted) delete account.scheduleExceptions[path.parts[1]]; else account.scheduleExceptions[path.parts[1]] = value; } };
  const firestore = Object.assign(() => ({ collection: () => ({ doc: () => ref }) }), {
    FieldPath: class { constructor(...parts) { this.parts = parts; } }, FieldValue: { delete: () => deleted },
  });
  const service = await load("../src/services/schedule.service.js", { "firebase-admin": { default: { firestore } } });
  await service.setDateException("c", "2030-01-01", { off: true });
  await service.setDateException("c", "2030-01-01", { morning: true });
  assert.equal((await service.getDateException("c", "2030-01-01")).off, undefined);
  await service.deleteDateException("c", "2030-01-01");
  assert.equal(await service.getDateException("c", "2030-01-01"), null);
});

test("combined expertise/language filtering excludes nonmatching records", async () => {
  const query = { where() { return this; }, get: async () => ({ docs: [{ id: "c", data: () => ({ profileCompleted: true, isVerified: true, profileData: { firstName: "Test", languages: ["English"], expertise: ["Therapist"] } }) }] }) };
  const { filterCounsellorsService } = await load("../src/services/counsellorFilter.service.js", { "../config/firebase.js": { db: { collection: () => query } } });
  assert.equal((await filterCounsellorsService({ languages: ["English"], expertise: ["Child Specialist"] })).length, 0);
  assert.equal((await filterCounsellorsService({ languages: ["English"], expertise: ["Therapist"] })).length, 1);
});

test("quote validation rejects missing fields and wrong types", () => {
  for (const body of [{}, { firstName: [] }]) {
    const res = response();
    validateQuoteRequest({ body }, res, () => assert.fail("Should reject"));
    assert.equal(res.code, 400);
  }
});

test("accepted quote survives notification failure without asking the client to resubmit", async () => {
  let count = 0;
  const { createQuoteRequest } = await load("../src/controllers/quote.controllers.js", {
    "../config/firebase.js": { db: { collection: () => ({ add: async () => { count++; return { id: "quote", update: async () => {} }; } }) } },
    "../services/quoteEmailService.js": { sendQuoteRequestEmail: async () => { throw new Error("mail unavailable"); } },
  });
  const res = response();
  await createQuoteRequest({ body: {} }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.success, true);
  assert.equal(count, 1);
});

test("quote HTML escapes submitted markup and preserves boolean consent", async () => {
  const { quoteRequestEmailTemplate } = await load("../src/utils/quoteRequestEmailTemplate.js", { "./escapeHtml.js": { escapeHtml } });
  const html = quoteRequestEmailTemplate({ firstName: '<a href="evil">Click</a>', allowCommunication: false });
  assert.equal(html.includes('<a href="evil">'), false);
  assert.equal(html.includes("&lt;a href=&quot;evil&quot;&gt;"), true);
  assert.equal(html.includes("No"), true);
});

test("counsellor session checks role and current record existence", async () => {
  const { getCounsellorSession } = await load("../src/controllers/counsellorSession.controllers.js", {
    "../config/firebase.js": { db: { collection: () => ({ doc: () => ({ get: async () => ({ id: "c", exists: true, data: () => ({ isVerified: true }) }) }) }) } },
  });
  const denied = response();
  await getCounsellorSession({ user: { role: "user" } }, denied, () => assert.fail());
  assert.equal(denied.code, 403);
  const valid = response();
  await getCounsellorSession({ user: { role: "counsellor", counsellorId: "c" } }, valid, () => assert.fail());
  assert.equal(valid.body.counsellorId, "c");
});

async function counsellorController(db, generateSmartSlotsForDate = async () => ({})) {
  return load("../src/controllers/counsellor.controllers.js", {
    "../config/firebase.js": { adminDb: db, db, storage: {} },
    "firebase-admin": { default: { firestore: { FieldValue: { serverTimestamp: () => "now", delete: () => "delete" } } } },
    "nodemailer": { default: {} }, "jsonwebtoken": { default: {} },
    "../utils/emailTemplate.js": { getOtpEmailHtml: () => "" },
    "../services/counsellorFilter.service.js": { filterCounsellorsService: async () => [] },
    "../services/timeslotGenerator.service.js": { generateSmartSlotsForDate },
    "../timeslots/slotUtils.timeslots.js": { indiaDateString },
  });
}

test("new profile creates root weekly schedule for selected days and generates availability", async () => {
  const account = { isVerified: true, email: "owner@example.com" };
  const ref = { get: async () => ({ exists: true, data: () => account }), set: async (data) => { Object.assign(account, data); } };
  const generated = [];
  const { updateProfile } = await counsellorController({ collection: () => ({ doc: () => ref }) }, async (_id, date) => { generated.push(date); });
  const req = { body: { counsellorId: "c", email: "owner@example.com", workingDays: "Monday", workingHours: '{"morning":{"start":"09:00","end":"12:00"}}', slotDuration: "60" } };
  validateCounsellorProfile(req, response(), () => {});
  const res = response();
  await updateProfile(req, res);
  assert.equal(res.code, 200);
  assert.equal(account.weeklySchedule.Monday.morning, true);
  assert.equal(account.weeklySchedule.Tuesday.morning, false);
  assert.equal(generated.length, 45);
});

test("profile reads include saved duration and tolerate missing email; list failures return controlled errors", async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ profileData: { slotDuration: 60 } }) }) }), where() { return this; }, get: async () => { throw new Error("read failed"); } }) };
  const controller = await counsellorController(db);
  const profile = response();
  await controller.getAllCounsellorsById({ params: { id: "c" } }, profile);
  assert.equal(profile.body.counsellor.slotDuration, 60);
  assert.equal(profile.body.counsellor.email, "");
  const list = response();
  await controller.getAllCounsellors({}, list);
  assert.equal(list.code, 500);
});
