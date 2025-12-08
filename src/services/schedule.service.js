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
  const ref = db
    .collection("counsellors")
    .doc(counsellorId)
    .collection("schedulePreferences")
    .doc("weekly");

  await ref.set({ weekly: weeklyData }, { merge: true });

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
export const getCounsellorTimeConfig = async (counsellorId) => {
  const ref = db.collection("counsellors").doc(counsellorId);
  const doc = await ref.get();

  if (!doc.exists) throw new Error("Counsellor profile not found");

  const data = doc.data();

  return {
    periodTimes: {
      morning: data.morning || null,
      afternoon: data.afternoon || null,
      evening: data.evening || null,
    },
    slotDuration: data.slotDuration || 30,
  };
};

/**
 * ---------------------------------------
 * Resolve final ON/OFF periods for a given date
 * weekly + exception logic merged
 * ---------------------------------------
 */
export const resolveFinalPeriods = async (counsellorId, dateStr) => {
  const dateObj = new Date(dateStr);
  const weekday = dateObj.getDay().toString(); // 0–6

  const weekly = await getWeeklySchedule(counsellorId);
  const exception = await getDateException(counsellorId, dateStr);

  if (!weekly) throw new Error("Weekly schedule not set");

  let base = weekly.weekly[weekday];

  // If no exception → use weekly schedule
  if (!exception) {
    return {
      morning: base.morning,
      afternoon: base.afternoon,
      evening: base.evening,
    };
  }

  // Apply exception logic
  if (exception.overrideType === "full-off") {
    return { morning: false, afternoon: false, evening: false };
  }

  if (exception.overrideType === "full-on") {
    return { morning: true, afternoon: true, evening: true };
  }

  if (exception.overrideType === "partial") {
    return {
      morning: exception.periods.morning,
      afternoon: exception.periods.afternoon,
      evening: exception.periods.evening,
    };
  }

  return base;
};
