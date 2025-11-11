import express from "express";
import { createAppointment, sendOtp, updateProfile, verifyOtp, listAppointments, getAppointment } from "../controllers/counsellor.controllers.js";


const router = express.Router();


//endpoint
router.post("/send-otp", sendOtp);

router.post("/verify-otp", verifyOtp);

router.post("/update-profile", updateProfile);

router.post("/create-appointment", createAppointment);

router.get("/list-appointments", listAppointments);

router.get("/get-appointment", getAppointment);



export default router;