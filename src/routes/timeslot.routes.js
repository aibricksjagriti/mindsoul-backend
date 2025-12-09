import express from "express";
import {authenticate} from "../middlewares/auth.middlewares.js";
import {
  getAvailableSlots,
  generateSlotsForCounsellor,
  deleteSlots,
  getBookedSlots,
  generateNext7Days,
  refreshDate,
  cronGenerateNext7Days,
} from "../controllers/timeslot.controllers.js";
import cronAuth from "../middlewares/cronAuth.middlewares.js";

const router = express.Router();

/*
------- PROTECTED ROUTES UNCOMMENT WHEN NEEDED -------
//GET  available slots
//GET /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
router.get("/counsellor/:id/slots"  getAvailableSlots);

//POST generate slots for a counsellor for a Date
//POST /api/timeslots/counsellor/:id/slots/generate
//BODY : { date : "YYYY-MM-DD" }
router.post(
  "/counsellor/:id/slots/generate"
  
  generateSlotsForCounsellor
);

//DELETE all slots for a date
router.delete("/counsellor/:id/slots"  deleteSlots);

//GET all booked slots for a date
//GET /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
router.get("/counsellor/:id/booked"  getBookedSlots);
----------
*/


//DELETE WHEN DONE TESTING
// Get available grouped slots
//GET /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
router.get("/counsellor/:id/slots", getAvailableSlots);

// Manual single-day generation (legacy)
//BODY : { date : "YYYY-MM-DD" }
router.post("/counsellor/:id/slots/generate", generateSlotsForCounsellor);

// Delete slots for a date (or specific period)
router.delete("/counsellor/:id/slots", deleteSlots);

// Get booked slots for a date
//GET /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
router.get("/counsellor/:id/booked", getBookedSlots);


//------------------ NEW SMART GENERATION ROUTES ------------------

// Generate next 7 days using weekly schedule
router.post("/counsellor/:id/generate-week", authenticate, generateNext7Days);

// Refresh a single date
router.post("/counsellor/:id/refresh", authenticate, refreshDate);

// Daily cron job (Cloud Scheduler)
router.post("/counsellor/:id/cron-generate",cronAuth, cronGenerateNext7Days); // No auth, internal use


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

export default router;
