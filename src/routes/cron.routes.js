import express from "express";
import { cronGenerateNext7Days } from "../controllers/timeslot.controllers.js";
import { verifyCronSecret } from "../middlewares/cronAuth.js";
import { cleanupExpiredAppointments } from "../controllers/cleanup.controllers.js";
import { db } from "../config/firebase.js";
import { createBookingEmailRetry } from "../services/bookingEmailRetry.service.js";
import { notifyComplimentaryBooking } from "../services/complimentaryMail.service.js";
import { notifyPaidBooking } from "../services/paidBookingMail.service.js";

const router = express.Router();
router.post("/cleanup-expired-appointments", verifyCronSecret, cleanupExpiredAppointments);
const retryEmails = createBookingEmailRetry({ db, notifyFree: notifyComplimentaryBooking, notifyPaid: notifyPaidBooking });
router.post("/retry-booking-emails", verifyCronSecret, async (req, res) => {
  try { res.json({ success: true, ...await retryEmails() }); }
  catch { res.status(503).json({ success: false, message: "Email retry service unavailable" }); }
});

// Internal-only cron endpoint
router.post(
  "/generate-slots",
  verifyCronSecret,
  cronGenerateNext7Days
);

export default router;
