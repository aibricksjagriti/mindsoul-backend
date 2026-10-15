import express from "express";
import { createAppointment } from "../controllers/appointment.controllers.js";
import { authenticate } from "../middlewares/auth.middlewares.js"
import { validateCreateAppointment } from "../middlewares/validators.js";
import { db } from "../config/firebase.js";
import { getComplimentaryHostLink } from "../services/complimentaryMeeting.service.js";
import { notifyPaidBooking } from "../services/paidBookingMail.service.js";

const router = express.Router();
router.get("/:id/host", authenticate, async (req, res) => {
  try {
    const snap = await db.collection("appointments").doc(req.params.id).get();
    const booking = snap.data();
    if (!snap.exists || booking.counsellorId !== req.user.counsellorId || req.user.role !== "counsellor") return res.status(403).json({ success: false, message: "Access denied" });
    if (booking.status !== "scheduled") return res.status(409).json({ success: false, message: "Session is not confirmed" });
    const meetingId = booking.zoomMeetingId || String(booking.zoomLink || "").match(/https:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/j\/(\d+)/i)?.[1];
    if (!meetingId) return res.status(409).json({ success: false, message: "Session host link is unavailable" });
    res.json({ success: true, startUrl: await getComplimentaryHostLink(String(meetingId)) });
  } catch { res.status(502).json({ success: false, message: "Could not retrieve the session host link. Please retry." }); }
});
router.post("/:id/notifications/retry", authenticate, async (req, res) => {
  try {
    const snap = await db.collection("appointments").doc(req.params.id).get();
    const booking = snap.data();
    if (!snap.exists || !((req.user.role === "user" && booking.studentId === req.user.uid) || (req.user.role === "counsellor" && booking.counsellorId === req.user.counsellorId) || req.user.role === "admin")) return res.status(403).json({ success: false, message: "Access denied" });
    res.json({ success: true, notifications: await notifyPaidBooking(req.params.id) });
  } catch (error) { res.status(error.statusCode || 503).json({ success: false, message: "Confirmation email delivery is pending. Please retry." }); }
});

//user books and appointment (must be authenticated)
router.post("/", authenticate, validateCreateAppointment, createAppointment);


export default router;
