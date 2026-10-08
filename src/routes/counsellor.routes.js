import express from "express";
  import { filterCounsellors, getAllCounsellors, getAllCounsellorsById, getCounsellorAppointments, sendOtp, updateProfile, verifyOtp } from "../controllers/counsellor.controllers.js";
import { upload } from "../middlewares/uploadImages.js";
import { authenticate } from "../middlewares/auth.middlewares.js";
import { otpRateLimiter } from "../middlewares/rateLimiter.middlewares.js";
import { requireCounsellorOwner, preserveCounsellorEmail } from "../middlewares/counsellorAccess.middlewares.js";
import { validateCounsellorProfile } from "../middlewares/counsellorProfileValidator.js";
import { getCounsellorSession } from "../controllers/counsellorSession.controllers.js";


const router = express.Router();


//endpoint
router.post("/send-otp", otpRateLimiter,  sendOtp);

router.post("/verify-otp",otpRateLimiter,  verifyOtp);

router.post("/update-profile", authenticate, upload.single("profileImage"), requireCounsellorOwner, preserveCounsellorEmail, validateCounsellorProfile, updateProfile);

router.get("/counsellor-appointments", authenticate, getCounsellorAppointments);

//get counsellors
router.get("/list", getAllCounsellors);
router.get("/session", authenticate, getCounsellorSession);

//get counsellors by id
//filter route for counsellors
router.get("/filter", filterCounsellors);
router.get("/:id", getAllCounsellorsById);



export default router;
