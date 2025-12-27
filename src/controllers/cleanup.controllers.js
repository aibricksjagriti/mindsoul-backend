import admin from "firebase-admin";
import { adminDb } from "../config/firebase.js";

export const cleanupExpiredAppointments = async (req, res) => {
  try {
    const now = admin.firestore.Timestamp.now();

    // 1. Find expired pending appointments
    const snap = await adminDb
      .collection("appointments")
      .where("paymentStatus", "==", "pending")
      .where("paymentExpiresAt", "<", now)
      .get();

    if (snap.empty) {
      return res.status(200).json({
        success: true,
        message: "No expired appointments to clean",
        cleaned: 0,
      });
    }

    let cleanedCount = 0;
    const batch = adminDb.batch();

    for (const doc of snap.docs) {
      const apt = doc.data();

      //skip malformed data
      if (!apt || !apt.timeSlot || !apt.counsellorId || !apt.date) {
        console.warn("Skipping malformed appointment:", doc.id);
        continue;
      }

      // 2. Extract slot start safely
      const slotStart = apt.timeSlot.split("-")[0]?.trim();
      if (!slotStart) {
        console.warn("Invalid timeSlot format, skipping:", doc.id);
        continue;
      }

      // 3. Find matching slot (if exists)
      const slotSnap = await adminDb
        .collection("timeSlots")
        .where("counsellorId", "==", apt.counsellorId)
        .where("date", "==", apt.date)
        .where("startTime", "==", slotStart)
        .limit(1)
        .get();

      // 4. Release slot if found
      if (!slotSnap.empty) {
        const slotRef = slotSnap.docs[0].ref;

        batch.update(slotRef, {
          isBooked: false,
          bookedBy: admin.firestore.FieldValue.delete(),
          bookedAt: admin.firestore.FieldValue.delete(),
        });
      } else {
        console.warn(
          "Slot not found for expired appointment:",
          doc.id,
          apt.timeSlot
        );
      }

      // 5. Mark appointment as expired
      batch.update(doc.ref, {
        status: "cancelled_expired",
        paymentStatus: "expired",
        paymentExpiresAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      cleanedCount++;
    }

    await batch.commit();

    return res.status(200).json({
      success: true,
      message: "Expired appointments cleaned successfully",
      cleaned: cleanedCount,
    });
  } catch (err) {
    console.error("Cleanup expired appointments error:", err);
    return res.status(500).json({
      success: false,
      message: "Cleanup failed",
      error: err.message, // helpful in logs
    });
  }
};
