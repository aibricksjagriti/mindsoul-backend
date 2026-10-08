import admin from "firebase-admin";
import { buildSlotPlan, buildCounsellorSlotPlan, slotsOverlap } from "./slotPlan.timeslots.js";

const db = admin.firestore();

export const generateSlotsForDate = async ({
  counsellorId, date, workingHours, slotDuration, allowedSlotIds = null, useCounsellorSchedule = false,
}) => {
  const suppliedPlan = useCounsellorSchedule ? null : buildSlotPlan({ counsellorId, date, workingHours, slotDuration });
  const query = db.collection("timeSlots")
    .where("counsellorId", "==", counsellorId).where("date", "==", date);
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(`${date}T23:59:59+05:30`));

  // Read and reconcile in one transaction. A concurrent reservation forces a retry.
  return db.runTransaction(async (transaction) => {
    let expected = suppliedPlan;
    if (useCounsellorSchedule) {
      const counsellor = await transaction.get(db.collection("counsellors").doc(counsellorId));
      if (!counsellor.exists) throw new Error("Counsellor not found");
      expected = buildCounsellorSlotPlan({ counsellorId, date, counsellor: counsellor.data() });
    }
    const expectedById = new Map(expected.map((slot) => [slot.id, slot]));
    const snapshot = await transaction.get(query);
    const existing = new Map(snapshot.docs.map((doc) => [doc.id, doc]));
    const booked = snapshot.docs.filter((doc) => doc.data().isBooked);
    const conflicts = [];
    let created = 0;
    let deleted = 0;

    if (!allowedSlotIds) {
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const planned = expectedById.get(doc.id);
        if (data.isBooked) {
          if (!planned || planned.endTime !== data.endTime) conflicts.push({ id: doc.id, ...data });
          continue;
        }
        if (!planned) {
          transaction.delete(doc.ref);
          deleted++;
        }
      }
    }

    for (const slot of expected) {
      if (allowedSlotIds && !allowedSlotIds.has(slot.id)) continue;
      const doc = existing.get(slot.id);
      if (doc?.data().isBooked) continue;
      if (booked.some((reservation) => slotsOverlap(slot, reservation.data()))) {
        if (doc) {
          transaction.delete(doc.ref);
          deleted++;
        }
        continue;
      }
      if (doc) {
        if (doc.data().endTime !== slot.endTime) {
          transaction.update(doc.ref, { endTime: slot.endTime, expiresAt });
        }
      } else {
        const { id, ...data } = slot;
        transaction.create(db.collection("timeSlots").doc(id), {
          ...data, isBooked: false, expiresAt,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        created++;
      }
    }

    return { success: true, created, deleted, conflicts, message: "Slots reconciled successfully" };
  });
};
