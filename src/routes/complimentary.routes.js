import express from "express";
import admin from "firebase-admin";
import { db } from "../config/firebase.js";
import { authenticate } from "../middlewares/auth.middlewares.js";
import { requireAdmin } from "../middlewares/requireAdmin.middlewares.js";
import { createComplimentaryBookingService, complimentaryBookingId } from "../services/complimentaryBooking.service.js";
import { createComplimentaryMeeting, getComplimentaryHostLink, deleteComplimentaryMeeting } from "../services/complimentaryMeeting.service.js";

const router = express.Router();
const service = createComplimentaryBookingService({ db, fieldValue: admin.firestore.FieldValue, createMeeting: createComplimentaryMeeting, deleteMeeting: deleteComplimentaryMeeting });
router.use(authenticate);
router.get("/eligibility", async (req, res, next) => {
  try { res.json({ success: true, ...await service.eligibility(req.user) }); } catch (error) { next(error); }
});
router.post("/appointments", async (req, res, next) => {
  try { res.status(201).json({ success: true, appointment: await service.book(req.user, req.body) }); } catch (error) { next(error); }
});
router.get("/requests/:requestId", async (req, res, next) => {
  try {
    if (req.user.role !== "user" || !req.user.uid || !/^[a-zA-Z0-9-]{16,80}$/.test(req.params.requestId)) return res.status(403).json({ success: false, message: "User sign-in required" });
    const snapshot = await db.collection("appointments").doc(complimentaryBookingId(req.user.uid, req.params.requestId)).get();
    if (!snapshot.exists) return res.status(404).json({ success: false, message: "Booking not found" });
    res.json({ success: true, appointment: snapshot.data() });
  } catch (error) { next(error); }
});
router.get("/appointments/:id", async (req, res, next) => {
  try {
    const snapshot = await db.collection("appointments").doc(req.params.id).get();
    if (!snapshot.exists || snapshot.data().bookingType !== "complimentary") return res.status(404).json({ success: false, message: "Booking not found" });
    if (snapshot.data().studentId !== req.user.uid) return res.status(403).json({ success: false, message: "Access denied" });
    res.json({ success: true, appointment: snapshot.data() });
  } catch (error) { next(error); }
});
router.get("/appointments/:id/host", async (req, res, next) => {
  try {
    const snapshot = await db.collection("complimentaryMeetingHosts").doc(req.params.id).get();
    if (!snapshot.exists) return res.status(404).json({ success: false, message: "Session is not ready" });
    if (req.user.role !== "counsellor" || snapshot.data().counsellorId !== req.user.counsellorId) return res.status(403).json({ success: false, message: "Access denied" });
    res.json({ success: true, startUrl: await getComplimentaryHostLink(snapshot.data().meetingId) });
  } catch (error) { next(error); }
});
router.put("/access/:uid", requireAdmin, async (req, res, next) => {
  try {
    if (typeof req.body?.active !== "boolean") return res.status(400).json({ success: false, message: "active must be a boolean" });
    const user = await db.collection("users").doc(req.params.uid).get();
    if (!user.exists) return res.status(404).json({ success: false, message: "User not found" });
    await db.collection("complimentaryAccess").doc(req.params.uid).set({ active: req.body.active, allowance: "unlimited", grantedBy: req.user.email, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    res.json({ success: true });
  } catch (error) { next(error); }
});
router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "We couldn't complete this request. Check your booking status before trying again" });
});
export default router;
