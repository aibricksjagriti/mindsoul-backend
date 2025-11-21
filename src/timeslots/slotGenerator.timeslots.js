// src/timeslots/slotGenerator.timeslots.js

import admin from "firebase-admin";
import { isFutureDateTime } from "./slotUtils.timeslots.js";

const db = admin.firestore();

/**
 * Generate slots for 1 counsellor for a specific date.
 * 
 * workingHours example:
 * {
 *   morning:   { start: "09:00", end: "12:00" },
 *   afternoon: { start: "14:00", end: "17:00" }
 * }
 * 
 * slotDuration example: 30 (minutes)
 */
export const generateSlotsForDate = async ({
  counsellorId,
  date,
  workingHours,
  slotDuration,
}) => {
  try {
    if (!counsellorId || !date || !workingHours || !slotDuration) {
      throw new Error("Missing required fields for slot generation");
    }

    const batch = db.batch();

    const periods = Object.keys(workingHours); // morning, afternoon, evening

    for (const period of periods) {
      const periodData = workingHours[period];
      if (!periodData?.start || !periodData?.end) continue;

      const start = periodData.start;
      const end = periodData.end;

      let [sh, sm] = start.split(":").map(Number);
      let [eh, em] = end.split(":").map(Number);

      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;

      for (let t = startMinutes; t < endMinutes; t += slotDuration) {
        const slotStartH = Math.floor(t / 60);
        const slotStartM = t % 60;
        const slotEndMinutes = t + slotDuration;

        if (slotEndMinutes > endMinutes) break;

        const slotEndH = Math.floor(slotEndMinutes / 60);
        const slotEndM = slotEndMinutes % 60;

        const startTime = `${String(slotStartH).padStart(2, "0")}:${String(
          slotStartM
        ).padStart(2, "0")}`;

        const endTime = `${String(slotEndH).padStart(2, "0")}:${String(
          slotEndM
        ).padStart(2, "0")}`;

        // Full timestamp to validate future slots
        const fullTimestamp = `${date}T${startTime}:00`;

        // Skip past time slots
        if (!isFutureDateTime(fullTimestamp)) continue;

        // Firestore doc ID pattern
        const docId = `${counsellorId}_${date}_${startTime}`;
        const docRef = db.collection("timeSlots").doc(docId);

        batch.set(docRef, {
          counsellorId,
          date,
          period,
          startTime,
          endTime,
          isBooked: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
    return { success: true, message: "Slots generated successfully" };
  } catch (err) {
    console.error("Slot Generation Error:", err);
    return { success: false, message: err.message };
  }
};
