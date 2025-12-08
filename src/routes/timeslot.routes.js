import express from "express";
import {} from "../middlewares/auth.middlewares.js";
import {
  getAvailableSlots,
  generateSlotsForCounsellor,
  deleteSlots,
  getBookedSlots,
} from "../controllers/timeslot.controllers.js";

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
//GET  available slots
//GET /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
router.get("/counsellor/:id/slots", getAvailableSlots);

//POST generate slots for a counsellor for a Date
//POST /api/timeslots/counsellor/:id/slots/generate
//BODY : { date : "YYYY-MM-DD" }
router.post("/counsellor/:id/slots/generate", generateSlotsForCounsellor);

//DELETE all slots for a date
router.delete("/counsellor/:id/slots", deleteSlots);

//GET all booked slots for a date
//GET /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
router.get("/counsellor/:id/booked", getBookedSlots);
export default router;
