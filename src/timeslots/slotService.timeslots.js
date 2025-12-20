// src/timeslots/slotService.timeslots.js

import admin from "firebase-admin";
import { isFutureDateTime } from "./slotUtils.timeslots.js";

const db = admin.firestore();

/**
 * Fetch all slots for a counselor for a specific date.
 */
export const getSlotsForDate = async (counsellorId, date) => {
  const snapshot = await db
    .collection("timeSlots")
    .where("counsellorId", "==", counsellorId)
    .where("date", "==", date)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

/**
 * Fetch ONLY future + available slots.
 */
export const getAvailableFutureSlots = async (counsellorId, date) => {
  const allSlots = await getSlotsForDate(counsellorId, date);

  return allSlots.filter((slot) => {
    const ts = `${slot.date}T${slot.startTime}:00`;
    return !slot.isBooked && isFutureDateTime(ts);
  });
};

/**
 * Mark a slot as booked (used as a fallback, though appointment.controller uses batch)
 */
export const markSlotAsBooked = async (
  counsellorId,
  date,
  startTime,
  userId
) => {
  const slotId = `${counsellorId}_${date}_${startTime}`;
  const slotRef = db.collection("timeSlots").doc(slotId);

  await slotRef.update({
    isBooked: true,
    bookedBy: userId,
    bookedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return true;
};

/**
 * Delete slots for a date (optional maintenance cleanup)
 */
export const deleteSlotsForDate = async (counsellorId, date) => {
  const slots = await getSlotsForDate(counsellorId, date);

  if (slots.length === 0) return true;

  const chunkSize = 400;
  let index = 0;

  while (index < slots.length) {
    const batch = db.batch();
    const chunk = slots.slice(index, index + chunkSize);

    chunk.forEach((slot) => {
      if (slot.isBooked) return; //never delete booked slots
      const ref = db.collection("timeSlots").doc(slot.id);
      batch.delete(ref);
    });

    await batch.commit();
    index += chunkSize;
  }

  return true;
};
