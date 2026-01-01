import express from "express";
import { cleanupExpiredAppointments } from "../controllers/cleanup.controllers.js";
// import { authenticate } from "../middlewares/auth.middlewares.js";
// import  { requireAdmin } from "../middlewares/requireAdmin.middlewares.js";

const router = express.Router();

//Protected route
router.post("/cleanup-expired-appointments",cleanupExpiredAppointments);

export default router;
  