import admin from "firebase-admin";
import { isFutureDateTime } from "./slotUtils.timeslots.js";

const db = admin.firestore();

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

    //DELETE EXISTING SLOTS FOR THIS COUNSELLOR + DATE
    const existingSnap = await db
      .collection("timeSlots")
      .where("counsellorId", "==", counsellorId)
      .where("date", "==", date)
      .get();

    const deleteBatch = db.batch();
    existingSnap.docs.forEach((doc) => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();

    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(`${date}T23:59:59`)
    );

    const operations = [];
    let createdCount = 0;

    const SESSION_DURATION = slotDuration; // 30
    const BREAK_DURATION = 15; // fixed rule
    const STEP = SESSION_DURATION + BREAK_DURATION; // 45

    for (const period of Object.keys(workingHours)) {
      const periodData = workingHours[period];
      if (!periodData?.start || !periodData?.end) continue;

      const [sh, sm] = periodData.start.split(":").map(Number);
      const [eh, em] = periodData.end.split(":").map(Number);

      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;

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

        const docId = `${counsellorId}_${date}_${period}_${startTime}`;

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

    // Now safely commit in chunks of 400
    // batch write
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
