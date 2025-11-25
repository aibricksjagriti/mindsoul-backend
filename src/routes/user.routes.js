import express from "express";
import { getUserProfile, updateUserProfile } from "../controllers/user.controllers.js";
import { authenticate } from "../middlewares/auth.middlewares.js";
import { validateUserProfile } from "../middlewares/userProfileValidator.js";
import { getUserAppointments } from "../controllers/user.controllers.js";

const router = express.Router();

//POST
router.patch(
  "/update-profile",
  authenticate,
  validateUserProfile,
  updateUserProfile
);

//GET
router.get("/user-profile", authenticate, getUserProfile);

//GET
router.get("/appointments", authenticate, getUserAppointments);

export default router;
