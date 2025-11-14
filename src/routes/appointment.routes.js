import express from "express";
import { createAppointment } from "../controllers/appointment.controllers.js";
import { authenticate } from "../middlewares/auth.middlewares.js"
import { validateCreateAppointment } from "../middlewares/validators.js";

const router = express.Router();

//user books and appointment (must be authenticated)
router.post("/", authenticate, validateCreateAppointment, createAppointment);


export default router;