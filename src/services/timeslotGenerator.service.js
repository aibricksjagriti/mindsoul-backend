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
 *  - generates ONLY missing slots
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

    
    /**
     * If counsellor is OFF for the whole day
     * → delete only UNBOOKED slots
     */

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

    // 5️. Simulate expected slots (ID-accurate)
    const expectedIds = await  simulateSlotIds(
      counsellorId,
      dateStr,
      workingHours,
      slotDuration
    );

    // 6️. Determine missing slots
    const missingIds = [...expectedIds].filter(
      (id) => !existingIds.has(id)
    );

    // 7️. Generate ONLY missing slots
    const creationResult = await generateSlotsForDate({
      counsellorId,
      date: dateStr,
      workingHours,
      slotDuration,
      allowedSlotIds:
        existingSlots.length === 0 ? null : new Set(missingIds),
    });

    // Safe logging (no undefined vars)
    console.log("SMART GENERATION RESULT", {
      counsellorId,
      date: dateStr,
      created: creationResult.created ?? 0,
      workingPeriods: Object.keys(workingHours),
    });

    return {
      success: true,
      created: creationResult.created ?? 0,
      deleted: 0,
      conflicts: [],
      message: "Smart slot generation completed",
    };
  } catch (err) {
    console.error("SMART GENERATION ERROR", {
      counsellorId,
      date: dateStr,
      error: err.message,
    });
    throw err;
  }
};


/**
 * ----------------------------------------------------------------------
 * SIMULATE SLOT GENERATION WITHOUT WRITING TO FIRESTORE
 * ----------------------------------------------------------------------
 *  * MUST match generateSlotsForDate EXACTLY

 */
const simulateSlotIds = async (
  counsellorId,
  date,
  workingHours,
  slotDuration
) => {
  const ids = new Set();

  const BREAK_DURATION = 15;
  const STEP = slotDuration + BREAK_DURATION;

  for (const period of Object.keys(workingHours)) {
    const { start, end } = workingHours[period];
    if (!start || !end) continue;

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);

    let t = sh * 60 + sm;
    const endMinutes = eh * 60 + em;

    while (t + slotDuration <= endMinutes) {
      const hh = String(Math.floor(t / 60)).padStart(2, "0");
      const mm = String(t % 60).padStart(2, "0");
      const startTime = `${hh}:${mm}`;

      const id = `${counsellorId}_${date}_${period}_${startTime}`;
      ids.add(id);

      t += STEP;
    }
  }

  return ids;
};
