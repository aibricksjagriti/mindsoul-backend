import admin from "firebase-admin";
import { isFutureDateTime } from "./slotUtils.timeslots.js";

const db = admin.firestore();

export const generateSlotsForDate = async ({
  counsellorId,
  date,
  workingHours,
  slotDuration,
  allowedSlotIds = null,
}) => {
  try {
    if (!counsellorId || !date || !workingHours || !slotDuration) {
      throw new Error("Missing required fields for slot generation");
    }

        /*
      PRODUCTION SAFETY GUARD (OPTIONAL)
      Uncomment if you ever want to BLOCK full regeneration in prod
    */
    /*
    if (!allowedSlotIds && process.env.NODE_ENV === "production") {
      throw new Error("Full slot regeneration is disabled in production");
    }
    */

     /**
     * If allowedSlotIds is NOT provided:
     * → full regeneration for this date
     * → existing slots for that date are deleted first
     *
     * If allowedSlotIds IS provided:
     * → only missing slots are generated
     * → booked slots are untouched
     */


    if (!allowedSlotIds) {
      const existingSnap = await db
        .collection("timeSlots")
        .where("counsellorId", "==", counsellorId)
        .where("date", "==", date)
        .get();

      const deleteBatch = db.batch();
      existingSnap.docs.forEach((doc) => deleteBatch.delete(doc.ref));
      await deleteBatch.commit();
    }

    /**
     * TTL — slots auto-expire at end of the day
     * This keeps Firestore clean
     */
    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(`${date}T23:59:59`)
    );

    const operations = [];
    let createdCount = 0;

    /**
     * Slot timing rules
     */
    const SESSION_DURATION = slotDuration; // 30
    const BREAK_DURATION = 15; // fixed rule
    const STEP = SESSION_DURATION + BREAK_DURATION; // 45

    /**
     * Loop over periods (morning / afternoon / evening)
     */
    for (const period of Object.keys(workingHours)) {
      const periodData = workingHours[period];
      if (!periodData?.start || !periodData?.end) continue;

      const [sh, sm] = periodData.start.split(":").map(Number);
      const [eh, em] = periodData.end.split(":").map(Number);

      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;

      /**
       * Generate slots inside the period window
       */
      for (
        let t = startMinutes;
        t + SESSION_DURATION <= endMinutes;
        t += STEP
      ) {
        const startH = Math.floor(t / 60);
        const startM = t % 60;

        const endT = t + SESSION_DURATION;
        const endH = Math.floor(endT / 60);
        const endM = endT % 60;

        const startTime = `${String(startH).padStart(2, "0")}:${String(
          startM
        ).padStart(2, "0")}`;
        const endTime = `${String(endH).padStart(2, "0")}:${String(
          endM
        ).padStart(2, "0")}`;


        /**
         * Deterministic document ID
         * Ensures idempotency
         */
        const docId = `${counsellorId}_${date}_${period}_${startTime}`;


        /**
         * If allowedSlotIds exists:
         * → generate ONLY missing slots
         */
        if (allowedSlotIds && !allowedSlotIds.has(docId)) {
          continue; // do not overwrite existing or booked slots
        } 

        // DEBUG (keep this!)
        console.log("SLOT", { period, startTime, endTime });

        operations.push({
          docId,
          data: {
            counsellorId,
            date,
            period,
            startTime,
            endTime,
            isBooked: false,
            expiresAt,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        });

        createdCount++;
      }
    }

    /**
     * Firestore batch limit safety
     */
    const chunkSize = 400;
    for (let i = 0; i < operations.length; i += chunkSize) {
      const batch = db.batch();
      operations.slice(i, i + chunkSize).forEach((op) => {
        batch.set(db.collection("timeSlots").doc(op.docId), op.data);
      });
      await batch.commit();
    }

    return {
      success: true,
      created: createdCount,
      message: "Slots generated successfully",
    };
  } catch (err) {
    console.error("Slot Generation Error:", err);
    return { success: false, message: err.message };
  }
};
