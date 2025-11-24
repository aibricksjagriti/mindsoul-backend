import express from "express";
import { authenticate } from "../middlewares/auth.middlewares.js";
import {
  getAvailableSlots,
  generateSlotsForCounsellor,
  deleteSlots,
  getBookedSlots,
} from "../controllers/timeslot.controllers.js";

const router = express.Router();

//GET  available slots
//GET /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
router.get("/counsellor/:id/slots", authenticate, getAvailableSlots);

//POST generate slots for a counsellor for a Date
//POST /api/timeslots/counsellor/:id/slots/generate
//BODY : { date : "YYYY-MM-DD" }
router.post(
  "/counsellor/:id/slots/generate",
  authenticate,
  generateSlotsForCounsellor
);

//DELETE all slots for a date
router.delete("/counsellor/:id/slots", authenticate, deleteSlots);

//GET all booked slots for a date
//GET /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
router.get("/counsellor/:id/booked", authenticate, getBookedSlots);

export default router;
