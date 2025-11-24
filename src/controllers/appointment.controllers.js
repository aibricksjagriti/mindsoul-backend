import { adminDb, auth, db } from "../config/firebase.js";
import admin from "firebase-admin"; // default import STILL available
import { emailClient } from "../services/emailService.js";
import { appointmentConfirmationTemplate } from "../utils/appointmentConfirmation.js";
import { counsellorNotificationTemplate } from "../utils/counsellorNotification.js";

// const nowTs = () => admin.firestore.FieldValue.servertimeSlotstamp();
const nowTs = () => admin.firestore.FieldValue.serverTimestamp();

import { createZoomMeeting } from "../services/createZoomMeeting.js";

export const createAppointment = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const {
      counsellorEmail,
      date,
      timeSlot, // e.g. "09:00-09:30"
      meta = {},
    } = req.body;

    if (!counsellorEmail || !date || !timeSlot) {
      return res
        .status(400)
        .json({ message: "counsellorEmail, date and timeSlot are required" });
    }

    // Validate date format
    if (isNaN(Date.parse(`${date}T00:00:00`))) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    // validate timeSlot format
    if (!timeSlot || !timeSlot.includes("-")) {
      return res.status(400).json({ message: "Invalid timeSlot slot format" });
    }

    //   NEW: BLOCK PAST SLOTS (CRITICAL FIX)
    const [slotStart, slotEnd] = timeSlot.split("-");
    const slotStartDateTime = new Date(`${date}T${slotStart}:00`);

    // Check if selected slot start time is in the past
    if (slotStartDateTime.getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "This time slot has already passed", // NEW
      });
    }

    const normalizedCounsellorEmail = String(counsellorEmail)
      .trim()
      .toLowerCase();

    const counsellorRef = adminDb
      .collection("counsellors")
      .doc(normalizedCounsellorEmail);
    const counsellorSnap = await counsellorRef.get();

    if (!counsellorSnap.exists) {
      return res.status(404).json({ message: "Counsellor not found" });
    }

    const counsellorData = counsellorSnap.data();
    if (!counsellorData.isVerified) {
      return res.status(403).json({ message: "Counsellor not verified" });
    }

    // TIME SLOT VALIDATION USING timeSlots COLLECTION
    const slotDocId = `${normalizedCounsellorEmail}_${date}_${slotStart}`;
    const slotRef = adminDb.collection("timeSlots").doc(slotDocId);
    const slotSnap = await slotRef.get();

    if (!slotSnap.exists) {
      return res.status(400).json({
        message: "Invalid or unavailable time slot",
      });
    }

    const slotData = slotSnap.data();

    // ------------------ Reject if slot already booked ------------------
    if (slotData.isBooked) {
      return res
        .status(409)
        .json({ message: "This time slot is already booked" });
    }

    //// --- END NEW FOR TIMESLOTS ---
    // >>> EXISTING CONFLICT CHECK (APPOINTMENTS COLLECTION)
    const conflictQuery = await adminDb
      .collection("appointments")
      .where("counsellorId", "==", normalizedCounsellorEmail)
      .where("date", "==", date)
      .where("timeSlot", "==", timeSlot)
      .limit(1)
      .get();

    if (!conflictQuery.empty) {
      return res.status(409).json({ message: "timeSlot slot already booked" });
    }

    // -------------------------------------------------
    // >>> CREATE ZOOM MEETING (UNCHANGED)
    // -------------------------------------------------
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
      counsellorId: normalizedCounsellorEmail,
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
      meta,
      status: "scheduled",
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };

    const batch = adminDb.batch();

    batch.set(appointmentRef, payload);
    batch.set(
      counsellorRef.collection("appointments").doc(appointmentId),
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

    // ---------------------------------------------------------
    //   >>> MARK TIMESLOT AS BOOKED IN timeSlots COLLECTION
    // ---------------------------------------------------------
    //// --- NEW FOR TIMESLOTS ---
    batch.update(slotRef, {
      isBooked: true,
      bookedBy: user.uid,
      bookedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    //// --- END NEW FOR TIMESLOTS ---

    await batch.commit();

    // ---------------------------------------------------------
    // EMAIL TO USER (UNCHANGED)
    // ---------------------------------------------------------
    try {
      const counsellorName =
        (counsellorData?.profileData?.firstName || "") +
        " " +
        (counsellorData?.profileData?.lastName || "");

      const html = appointmentConfirmationTemplate({
        studentName: user.name || user.email,
        counsellorName,
        date,
        timeSlot,
        zoomLink: actualZoomLink,
      });

      await emailClient.sendMail({
        from: `MINDSOUL <${process.env.MAIL_USER}>`,
        to: user.email,
        subject: "Hello User, Your Counselling Appointment is Confirmed",
        html,
      });
    } catch (mailErr) {
      console.error("Email sending failed:", mailErr);
    }

    // ---------------------------------------------------------
    // EMAIL TO COUNSELLOR (UNCHANGED)
    // ---------------------------------------------------------
    try {
      const counsellorName =
        (counsellorData?.profileData?.firstName || "") +
        " " +
        (counsellorData?.profileData?.lastName || "");

      const counsellorEmailForMail =
        counsellorData?.email || normalizedCounsellorEmail;

      const counsellorHtml = counsellorNotificationTemplate({
        counsellorName,
        studentName: user.name || user.email,
        studentEmail: user.email,
        date,
        timeSlot,
        startUrl: zoomMeeting.startUrl,
      });

      await emailClient.sendMail({
        from: `MINDSOUL <${process.env.MAIL_USER}>`,
        to: counsellorEmailForMail,
        subject: "Hello Counsellor, You have a new appointment",
        html: counsellorHtml,
      });
    } catch (cMailErr) {
      console.error("Counsellor email sending failed:", cMailErr);
    }

    return res.status(201).json({
      success: true,
      message: "Appointment created",
      appointment: payload,
    });
  } catch (err) {
    console.error("createAppointment error:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};
