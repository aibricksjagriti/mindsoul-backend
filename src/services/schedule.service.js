// src/services/schedule.service.js
import admin from "firebase-admin";

const db = admin.firestore();

/**
 * ---------------------------------------
 * Load Weekly Schedule Preferences
 * ---------------------------------------
 */
export const getWeeklySchedule = async (counsellorId) => {
  const ref = db
    .collection("counsellors")
    .doc(counsellorId)
    .collection("schedulePreferences")
    .doc("weekly");

  const doc = await ref.get();
  return doc.exists ? doc.data() : null;
};

/**
 * ---------------------------------------
 * Update Weekly Schedule Preferences
 * ---------------------------------------
 * weeklyData = {
 *   "0": { morning: true, afternoon: false, evening: true },
 *   "1": { morning: false, afternoon: true, evening: true },
 *   ...
 * }
 */
export const updateWeeklySchedule = async (counsellorId, weeklyData) => {
  const ref = db.collection("counsellors").doc(counsellorId);

  await ref.set(
    {
      weeklySchedule: weeklyData
    },
    { merge: true }
  );

  return { success: true };
};


/**
 * ---------------------------------------
 * Get date-level exception
 * ---------------------------------------
 */
export const getDateException = async (counsellorId, date) => {
  const ref = db
    .collection("counsellors")
    .doc(counsellorId)
    .collection("exceptions")
    .doc(date);

  const doc = await ref.get();
  return doc.exists ? doc.data() : null;
};

/**
 * ---------------------------------------
 * Set/update date-level exception
 * ---------------------------------------
 * exceptionData = {
 *   overrideType: "full-off" | "full-on" | "partial",
 *   periods: { morning: true, afternoon: false, evening: true }
 * }
 */
export const setDateException = async (counsellorId, date, exceptionData) => {
  const ref = db
    .collection("counsellors")
    .doc(counsellorId)
    .collection("exceptions")
    .doc(date);

  await ref.set(
    {
      date,
      ...exceptionData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { success: true };
};

/**
 * ---------------------------------------
 * Delete date-level exception
 * ---------------------------------------
 */
export const deleteDateException = async (counsellorId, date) => {
  const ref = db
    .collection("counsellors")
    .doc(counsellorId)
    .collection("exceptions")
    .doc(date);

  await ref.delete();
  return { success: true };
};

/**
 * ---------------------------------------
 * Load counsellor's periodTimes + slotDuration
 * from their profile document
 * ---------------------------------------
 */
// src/services/schedule.service.js

export const getCounsellorTimeConfig = async (counsellorId) => {
  const ref = db.collection("counsellors").doc(counsellorId);
  const snap = await ref.get();

  if (!snap.exists) throw new Error("Counsellor not found");

  const data = snap.data();
  const profile = data.profileData || {};
  const workingHours = profile.workingHours || {};

  // NEW — convert workingHours → periodTimes
  const periodTimes = {
    morning: workingHours.morning ?? null,
    afternoon: workingHours.afternoon ?? null,
    evening: workingHours.evening ?? null
  };

  const slotDuration = profile.slotDuration ?? 30;

  return {
    periodTimes,
    slotDuration
  };
};


/**
 * ---------------------------------------
 * Resolve final ON/OFF periods for a given date
 * weekly + exception logic merged
 * ---------------------------------------
 */
export const resolveFinalPeriods = async (counsellorId, dateStr) => {
  const ref = db.collection("counsellors").doc(counsellorId);
  const snap = await ref.get();

  if (!snap.exists) throw new Error("Counsellor not found");

  const data = snap.data();

  // READ WEEKLY SCHEDULE FROM ROOT FIELD
  const weekly = data.weeklySchedule || {};

  // Convert date → weekday name
  const dayName = new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
  });

  // Default availability for this weekday
  const base = weekly[dayName] || {
    morning: false,
    afternoon: false,
    evening: false,
  };

  // Start with weekly schedule as base
  let final = { ...base };

  // READ DATE EXCEPTION FROM SUBCOLLECTION
  const excRef = ref.collection("schedulePreferences").doc(dateStr);
  const excSnap = await excRef.get();

  if (excSnap.exists) {
    const ex = excSnap.data();

    // Full day off
    if (ex.off === true) {
      final = { morning: false, afternoon: false, evening: false };
    } else {
      final = {
        morning: ex.morning ?? final.morning,
        afternoon: ex.afternoon ?? final.afternoon,
        evening: ex.evening ?? final.evening,
      };
    }
  }

  return final;
};


