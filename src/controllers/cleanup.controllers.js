import admin from "firebase-admin";
import { adminDb } from "../config/firebase.js";

export const cleanupExpiredAppointments = async (req, res) => {
  try {
    const now = admin.firestore.Timestamp.now();
    const snap = await adminDb.collection("appointments").where("paymentStatus", "==", "pending").where("paymentExpiresAt", "<", now).get();
    let cleaned = 0;
    for (const doc of snap.docs) {
      const changed = await adminDb.runTransaction(async tx => {
        const fresh = await tx.get(doc.ref);
        const apt = fresh.data();
        if (!apt || apt.paymentStatus !== "pending" || !apt.paymentExpiresAt || apt.paymentExpiresAt.toMillis() >= now.toMillis() || !apt.timeSlot || !apt.counsellorId || !apt.studentId) return false;
        const slots = await tx.get(adminDb.collection("timeSlots").where("counsellorId", "==", apt.counsellorId).where("date", "==", apt.date).where("startTime", "==", apt.timeSlot.split("-")[0].trim()));
        for (const slot of slots.docs) {
          const data = slot.data();
          // Legacy reservations have no appointment ID; don't release ambiguous ownership.
          if (data.bookedAppointmentId === doc.id) tx.update(slot.ref, { isBooked: false, bookedBy: admin.firestore.FieldValue.delete(), bookedAppointmentId: admin.firestore.FieldValue.delete(), bookedAt: admin.firestore.FieldValue.delete() });
        }
        const update = { status: "cancelled_expired", paymentStatus: "expired", paymentExpiresAt: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        tx.update(doc.ref, update);
        tx.set(adminDb.collection("users").doc(apt.studentId).collection("appointments").doc(doc.id), update, { merge: true });
        tx.set(adminDb.collection("counsellors").doc(apt.counsellorId).collection("appointments").doc(doc.id), update, { merge: true });
        return true;
      });
      if (changed) cleaned++;
    }
    res.json({ success: true, cleaned, message: "Expired appointments checked" });
  } catch {
    res.status(500).json({ success: false, message: "Cleanup failed" });
  }
};
