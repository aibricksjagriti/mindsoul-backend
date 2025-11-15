import { adminDb, auth, db } from "../config/firebase.js";
import admin from "firebase-admin"; // default import STILL available
import { emailClient } from "../services/emailService.js";
import { appointmentConfirmationTemplate } from "../utils/appointmentConfirmation.js";
import { counsellorNotificationTemplate } from "../utils/counsellorNotification.js";

const nowTs = () => admin.firestore.FieldValue.serverTimestamp();

import { createZoomMeeting } from "../services/createZoomMeeting.js";

//with zoom integration
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
        .json({ message: "counsellorEmail, date and time are required" });
    }

    // Validate date format
    if (isNaN(Date.parse(`${date}T00:00:00`))) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    //validate time slot
    if (!timeSlot || !timeSlot.includes("-")) {
      return res.status(400).json({ message: "Invalid time slot format" });
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

    // Check time conflict
    const conflictQuery = await adminDb
      .collection("appointments")
      .where("counsellorId", "==", normalizedCounsellorEmail)
      .where("date", "==", date)
      .where("timeSlot", "==", timeSlot)
      .limit(1)
      .get();

    if (!conflictQuery.empty) {
      return res.status(409).json({ message: "Time slot already booked" });
    }

    // -------------------------------------------------
    // >>> CREATE ZOOM MEETING (SINGLE HOST MODE)
    // -------------------------------------------------
    if (!process.env.ZOOM_HOST_EMAIL) {
      return res
        .status(500)
        .json({ message: "Zoom host email not configured" });
    }

    const zoomMeeting = await createZoomMeeting(
      process.env.ZOOM_HOST_EMAIL, // Single Zoom host
      date,
      time,
      "Counselling Session"
    );

    const actualZoomLink = zoomMeeting.joinUrl;
    // -------------------------------------------------

    // -------------------------------------------------

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
      time,
      zoomLink: actualZoomLink, // <---- UPDATED
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

    await batch.commit();

    // ---------------- EMAIL SENDING (NEW CODE) ----------------
    try {
      const counsellorName =
        (counsellorData?.profileData?.firstName || "") +
        " " +
        (counsellorData?.profileData?.lastName || "");

      const html = appointmentConfirmationTemplate({
        studentName: user.displayName || user.email,
        counsellorName,
        date,
        time,
        zoomLink: actualZoomLink,
      });

      await emailClient.sendMail({
        from: `MINDSOUL <${process.env.MAIL_USER}>`,
        to: user.email,
        subject: "Your Counselling Appointment is Confirmed",
        html,
      });
    } catch (mailErr) {
      console.error("Email sending failed:", mailErr);
    }
    // ---------------------------------------------------------

    // ---------------- EMAIL TO COUNSELLOR (NEW) ----------------
    try {
      const counsellorName =
        (counsellorData?.profileData?.firstName || "") +
        " " +
        (counsellorData?.profileData?.lastName || "");

      // Prefer counsellor email from profileData if present, otherwise use document id
      const counsellorEmailForMail =
        counsellorData?.email || normalizedCounsellorEmail;

      const counsellorHtml = counsellorNotificationTemplate({
        counsellorName,
        studentName: user.displayName || user.email,
        date,
        time,
        startUrl: zoomMeeting.startUrl, // uses startUrl returned from Zoom
      });

      await emailClient.sendMail({
        from: `MINDSOUL <${process.env.MAIL_USER}>`,
        to: counsellorEmailForMail,
        subject: "You have a new counselling appointment",
        html: counsellorHtml,
      });
    } catch (cMailErr) {
      console.error("Counsellor email sending failed:", cMailErr);
    }
    // ---------------------------------------------------------

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

// export const createAppointment = async (req, res) => {
//   try {
//     // req.user must be set by auth middleware (uid, email, displayName, etc.)
//     const user = req.user;
//     if (!user) return res.status(401).json({ message: "Unauthorized" });

//     const {
//       counsellorEmail,
//       date,      // 'YYYY-MM-DD'
//       time,      // 'HH:MM'
//       meta = {},
//       zoomLink = null,
//     } = req.body;

//     if (!counsellorEmail || !date || !time) {
//       return res.status(400).json({ message: "counsellorEmail, date and time are required" });
//     }

//     const normalizedCounsellorEmail = String(counsellorEmail).trim().toLowerCase();
//     const counsellorRef = adminDb.collection("counsellors").doc(normalizedCounsellorEmail);
//     const counsellorSnap = await counsellorRef.get();

//     if (!counsellorSnap.exists) {
//       return res.status(404).json({ message: "Counsellor not found" });
//     }
//     const counsellorData = counsellorSnap.data();
//     if (!counsellorData.isVerified) {
//       return res.status(403).json({ message: "Counsellor not verified" });
//     }

//     // Optional: check counsellor availability for date/time here
//     // (e.g., ensure no conflicting appointment exists). Example quick check:
//     const conflictQuery = await adminDb
//       .collection("appointments")
//       .where("counsellorId", "==", normalizedCounsellorEmail)
//       .where("date", "==", date)
//       .where("time", "==", time)
//       .limit(1)
//       .get();
//     if (!conflictQuery.empty) {
//       return res.status(409).json({ message: "Time slot already booked" });
//     }

//     // Create appointment doc in top-level collection with generated id
//     const appointmentRef = adminDb.collection("appointments").doc();
//     const appointmentId = appointmentRef.id;

//     const payload = {
//       id: appointmentId,
//       counsellorId: normalizedCounsellorEmail,
//       counsellorProfileSnapshot: {
//         firstName: counsellorData?.profileData?.firstName ?? null,
//         lastName: counsellorData?.profileData?.lastName ?? null,
//         expertise: counsellorData?.profileData?.expertise ?? null,
//       },
//       studentId: user.uid,
//       studentEmail: user.email || null,
//       date,
//       time,
//       zoomLink,
//       meta,
//       status: "scheduled",
//       createdAt: nowTs(),
//       updatedAt: nowTs(),
//     };

//     // Use a batch to write atomically to three locations
//     const batch = adminDb.batch();

//     // top-level
//     batch.set(appointmentRef, payload);

//     // mirror under counsellor subcollection
//     const counsellorAppointmentsRef = counsellorRef.collection("appointments").doc(appointmentId);
//     batch.set(counsellorAppointmentsRef, payload);

//     // mirror under user subcollection
//     const userRef = adminDb.collection("users").doc(user.uid);
//     const userAppointmentsRef = userRef.collection("appointments").doc(appointmentId);
//     batch.set(userAppointmentsRef, payload);

//     await batch.commit();

//     return res.status(201).json({ success: true, message: "Appointment created", appointment: payload });
//   } catch (err) {
//     console.error("createAppointment error:", err);
//     return res.status(500).json({ message: "Internal server error", error: err.message });
//   }
// };
