import { adminDb, auth, db } from "../config/firebase.js";
import admin from "firebase-admin";

const nowTs = () => admin.firestore.FieldValue.serverTimestamp();

import { createZoomMeeting } from "../services/createZoomMeeting.js";

export const createAppointment = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const {
      counsellorId,
      date,
      timeSlot, // e.g. "09:00-09:30"
      meta = {},
    } = req.body;

    if (!counsellorId || !date || !timeSlot) {
      return res
        .status(400)
        .json({ message: "counsellorId, date and timeSlot are required" });
    }

    // Validate date format
    if (isNaN(Date.parse(`${date}T00:00:00`))) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    // validate timeSlot format
    if (!timeSlot || !timeSlot.includes("-")) {
      return res.status(400).json({ message: "Invalid timeSlot slot format" });
    }

    //   BLOCK PAST SLOTS (CRITICAL FIX)
    const [slotStart, slotEnd] = timeSlot.split("-");
    const slotStartDateTime = new Date(`${date}T${slotStart}:00`);

    // Check if selected slot start time is in the past
    if (slotStartDateTime.getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "This time slot has already passed", // NEW
      });
    }

    const counsellorRef = adminDb.collection("counsellors").doc(counsellorId); //  NEW
    const counsellorSnap = await counsellorRef.get();

    if (!counsellorSnap.exists) {
      return res.status(404).json({ message: "Counsellor not found" });
    }

    const counsellorData = counsellorSnap.data();
    if (!counsellorData.isVerified) {
      return res.status(403).json({ message: "Counsellor not verified" });
    }

    // Extract sessionPrice safely
    const sessionPrice =
      counsellorData?.profileData?.sessionPrice ??
      counsellorData?.sessionPrice ??
      null;

    // Reject if counsellor has not set pricing
    if (!sessionPrice || isNaN(Number(sessionPrice))) {
      return res.status(400).json({
        message: "Counsellor has not set a valid session price",
      });
    }

    const normalizedSlotStart = slotStart.trim(); // reuse earlier slotStart

    const slotQuerySnap = await adminDb
      .collection("timeSlots")
      .where("counsellorId", "==", counsellorId)
      .where("date", "==", date)
      .where("startTime", "==", normalizedSlotStart)
      .limit(1)
      .get();

    if (slotQuerySnap.empty) {
      return res.status(400).json({
        message: "Invalid or unavailable time slot",
      });
    }

    const slotRef = slotQuerySnap.docs[0].ref;
    const slotData = slotQuerySnap.docs[0].data();

    // Reject if already booked
    if (slotData.isBooked) {
      return res.status(409).json({
        message: "This time slot is already booked",
      });
    }

    //// --- END NEW FOR TIMESLOTS ---
    // >>> EXISTING CONFLICT CHECK (APPOINTMENTS COLLECTION)
    const conflictQuery = await adminDb
      .collection("appointments")
      .where("counsellorId", "==", counsellorId)
      .where("date", "==", date)
      .where("timeSlot", "==", timeSlot)
      .limit(1)
      .get();

    if (!conflictQuery.empty) {
      return res.status(409).json({ message: "timeSlot slot already booked" });
    }

    // CREATE ZOOM MEETING (UNCHANGED)

    if (!process.env.ZOOM_HOST_EMAIL) {
      return res
        .status(500)
        .json({ message: "Zoom host email not configured" });
    }

    const zoomMeeting = await createZoomMeeting(
      process.env.ZOOM_HOST_EMAIL,
      date,
      timeSlot,
      "Counselling Session"
    );

    const actualZoomLink = zoomMeeting.joinUrl;

    // Prepare Appointment Document
    const appointmentRef = adminDb.collection("appointments").doc();
    const appointmentId = appointmentRef.id;

    const payload = {
      id: appointmentId,
      counsellorId,
      counsellorProfileSnapshot: {
        firstName: counsellorData?.profileData?.firstName ?? null,
        lastName: counsellorData?.profileData?.lastName ?? null,
        expertise: counsellorData?.profileData?.expertise ?? null,
      },
      studentId: user.uid,
      studentEmail: user.email || null,
      date,
      timeSlot,
      zoomLink: actualZoomLink,

      amount: Number(sessionPrice),
      meta,
      status: "pending_payment",

      //payment status
      paymentStatus: "pending",

      //payment expiry 10 minutes
      paymentExpiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 10 * 60 * 1000)
      ),
      paymentId: null,
      orderId: null,
      signature: null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };

    const batch = adminDb.batch();

    batch.set(appointmentRef, payload);
    batch.set(
      counsellorRef.collection("appointments").doc(appointmentId), //  NEW
      payload
    );

    batch.set(
      adminDb
        .collection("users")
        .doc(user.uid)
        .collection("appointments")
        .doc(appointmentId),
      payload
    );

    //MARK TIMESLOT AS BOOKED IN timeSlots COLLECTION

    batch.update(slotRef, {
      isBooked: true,
      bookedBy: user.uid,
      bookedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return res.status(201).json({
      success: true,
      message: "Appointment created. Awaiting payment.",
      appointment: payload,
    });
  } catch (err) {
    console.error("createAppointment error:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};
