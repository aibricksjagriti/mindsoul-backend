import express from "express";
  import { sendOtp, updateProfile, verifyOtp } from "../controllers/counsellor.controllers.js";
import { upload } from "../middlewares/uploadImages.js";



const router = express.Router();


//endpoint
router.post("/send-otp", sendOtp);

router.post("/verify-otp", verifyOtp);

router.post("/update-profile",upload.single("profileImage"),  updateProfile);




export default router;