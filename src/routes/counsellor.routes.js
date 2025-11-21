import express from "express";
  import { filterCounsellors, getAllCounsellors, sendOtp, updateProfile, verifyOtp } from "../controllers/counsellor.controllers.js";
import { upload } from "../middlewares/uploadImages.js";
import { authenticate } from "../middlewares/auth.middlewares.js";


const router = express.Router();


//endpoint
router.post("/send-otp", sendOtp);

router.post("/verify-otp", verifyOtp);

router.post("/update-profile", authenticate, upload.single("profileImage"),  updateProfile);  

//get counsellors
router.get("/list", getAllCounsellors);

//filter route for counsellors
router.get("/filter", filterCounsellors);


export default router;