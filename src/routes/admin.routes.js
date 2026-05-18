import express from "express";
import {
  adminLogin,
  getAllCounsellorsAdmin,
  updateCounsellorAdmin,
  deleteCounsellorAdmin,
  getAllUsersAdmin,
  getAllAppointmentsAdmin,
  getStatsAdmin,
} from "../controllers/admin.controllers.js";
import { authenticate } from "../middlewares/auth.middlewares.js";
import { requireAdmin } from "../middlewares/requireAdmin.middlewares.js";
import { cleanupExpiredAppointments } from "../controllers/cleanup.controllers.js";
import { upload } from "../middlewares/uploadImages.js";

const router = express.Router();

// Public — admin login
router.post("/login", adminLogin);

// Protected admin routes
router.get("/stats", authenticate, requireAdmin, getStatsAdmin);
router.get("/counsellors", authenticate, requireAdmin, getAllCounsellorsAdmin);
router.put("/counsellors/:id", authenticate, requireAdmin, upload.single("profileImage"), updateCounsellorAdmin);
router.delete("/counsellors/:id", authenticate, requireAdmin, deleteCounsellorAdmin);
router.get("/users", authenticate, requireAdmin, getAllUsersAdmin);
router.get("/appointments", authenticate, requireAdmin, getAllAppointmentsAdmin);

// Cron cleanup (kept from original)
router.post("/cleanup-expired-appointments", cleanupExpiredAppointments);

export default router;
