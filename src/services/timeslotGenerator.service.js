// src/services/timeslotGenerator.service.js

import admin from "firebase-admin";
import {
  resolveFinalPeriods,
  getCounsellorTimeConfig,
} from "./schedule.service.js";

import { getSlotsForDate } from "../timeslots/slotService.timeslots.js";

import { generateSlotsForDate } from "../timeslots/slotGenerator.timeslots.js";

const db = admin.firestore();

/**
 * --------------------------------------------
 * SMART SLOT GENERATOR FOR A SINGLE DATE
 * --------------------------------------------
 * This merges weekly schedule + exception +
 * counsellor's time config to determine what
 * periods should be ON for the date.
 *
 * Then:
 *  - Creates missing slots
 *  - Deletes obsolete slots (only if NOT booked)
 *  - Returns conflict list for booked obsolete slots
 */
export const generateSmartSlotsForDate = async (counsellorId, dateStr) => {
  try {
    // 1. Determine which periods are ON for this date
    const finalPeriods = await resolveFinalPeriods(counsellorId, dateStr);

    // 2. Load counsellor's periodTimes + slotDuration
    const { periodTimes, slotDuration } = await getCounsellorTimeConfig(
      counsellorId
    );

    // 3. Build workingHours object in the format generateSlotsForDate expects
    const workingHours = {};

    if (finalPeriods.morning && periodTimes.morning)
      workingHours.morning = periodTimes.morning;

    if (finalPeriods.afternoon && periodTimes.afternoon)
      workingHours.afternoon = periodTimes.afternoon;

    if (finalPeriods.evening && periodTimes.evening)
      workingHours.evening = periodTimes.evening;

    // 4. Fetch existing slots for this date
    const existingSlots = await getSlotsForDate(counsellorId, dateStr);
    const existingIds = new Set(existingSlots.map((s) => s.id));

    // 5. If no workingHours → full day off → delete all unbooked slots
    if (Object.keys(workingHours).length === 0) {
      let deleted = 0;
      let conflicts = [];

      const batch = db.batch();

      for (const slot of existingSlots) {
        if (slot.isBooked) {
          conflicts.push(slot);
          continue;
        }

        const ref = db.collection("timeSlots").doc(slot.id);
        batch.delete(ref);
        deleted++;
      }

      await batch.commit();

      return {
        success: true,
        created: 0,
        deleted,
        conflicts,
        message: "Counsellor unavailable for this date",
      };
    }

    // 6. BEFORE generating new slots, list the expected slot IDs
    const expectedSlots = await simulateSlotGeneration(
      counsellorId,
      dateStr,
      workingHours,
      slotDuration
    );
    const expectedIds = new Set(expectedSlots.map((s) => s.id));

    // 7. Determine obsolete slots (existing but not expected)
    const toDelete = existingSlots.filter((slot) => !expectedIds.has(slot.id));

    // 8. Delete unbooked obsolete slots → keep booked ones as conflicts
    let deletedCount = 0;
    let conflictList = [];

    const batchDel = db.batch();

    for (const slot of toDelete) {
      if (slot.isBooked) {
        conflictList.push(slot);
        continue;
      }

      const ref = db.collection("timeSlots").doc(slot.id);
      batchDel.delete(ref);
      deletedCount++;
    }

    await batchDel.commit();

    // 9. Actually generate the needed slots (creation only)
    const creationResult = await generateSlotsForDate({
      counsellorId,
      date: dateStr,
      workingHours,
      slotDuration,
    });

    // ----------- LOG RESULT TO CLOUD RUN -----------
    console.log("SMART GENERATION RESULT", {
      counsellorId,
      date: dateStr,
      created: creationResult.created ?? 0,
      deleted: deletedCount,
      conflicts: conflictList.length,
      conflictSlots: conflictList.map((s) => s.id), // optional but very helpful
      workingHours: Object.keys(workingHours),
    });
    // -----------------------------------------------

    return {
      success: true,
      created: creationResult.created ?? 0,
      deleted: deletedCount,
      conflicts: conflictList,
      message: "Smart slot generation completed",
    };
  } catch (err) {
    console.error("SMART GENERATION ERROR", {
      counsellorId,
      date: dateStr,
      error: err.message,
      stack: err.stack,
    });
    throw new Error(err.message);
  }
};

/**
 * ----------------------------------------------------------------------
 * SIMULATE SLOT GENERATION WITHOUT WRITING TO FIRESTORE
 * ----------------------------------------------------------------------
 * Returns a list of expected slot IDs so we can compare and delete old ones.
 */
const simulateSlotGeneration = async (
  counsellorId,
  date,
  workingHours,
  slotDuration
) => {
  const simulatedSlots = [];

  for (const period of Object.keys(workingHours)) {
    const { start, end } = workingHours[period];

    if (!start || !end) continue;

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);

    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;

    for (let t = startMinutes; t < endMinutes; t += slotDuration) {
      const endT = t + slotDuration;
      if (endT > endMinutes) break;

      const hh = String(Math.floor(t / 60)).padStart(2, "0");
      const mm = String(t % 60).padStart(2, "0");

      const id = `${counsellorId}_${date}_${hh}:${mm}`;

      simulatedSlots.push({ id });
    }
  }

  return simulatedSlots;
};
