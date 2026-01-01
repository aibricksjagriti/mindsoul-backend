import express from "express";
import { authenticate } from "../middlewares/auth.middlewares.js";
import {
  getAvailableSlots,
  getBookedSlots,
  generateNext7Days,
  refreshDate,
  cronGenerateNext7Days,
} from "../controllers/timeslot.controllers.js";
import cronAuth from "../middlewares/cronAuth.middlewares.js";

const router = express.Router();

/**
 * BASE: /api/timeslots
 *
 * Existing:
 * GET    /counsellor/:id/slots?date=YYYY-MM-DD
 * POST   /counsellor/:id/slots/generate
 * DELETE /counsellor/:id/slots
 * GET    /counsellor/:id/booked?date=YYYY-MM-DD
 *
 * NEW:
 * POST /counsellor/:id/generate-week
 * POST /counsellor/:id/refresh?date=YYYY-MM-DD
 * POST /counsellor/:id/cron-generate
 *
 */

// Get available grouped slots (public)
router.get("/counsellor/:id/slots", getAvailableSlots);

// Get booked slots for a date (public)
router.get("/counsellor/:id/booked", getBookedSlots);

/**
 * PROTECTED (counsellor actions)
 * ------------------------------
 * POST /counsellor/:id/generate-week
 * POST /counsellor/:id/refresh?date=YYYY-MM-DD
 */

// Generate slots for upcoming days (weekly schedule)
router.post("/counsellor/:id/generate-week", authenticate, generateNext7Days);

// Refresh slots for a specific date
router.post("/counsellor/:id/refresh", authenticate, refreshDate);

/**
 * INTERNAL (Cloud Scheduler only)
 * --------------------------------
 * POST /counsellor/:id/cron-generate
 */

// Daily cron job (no user auth, secret-based)
router.post("/counsellor/:id/cron-generate", cronAuth, cronGenerateNext7Days);

export default router;
