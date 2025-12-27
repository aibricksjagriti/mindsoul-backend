import express from "express";
import { cleanupExpiredAppointments } from "../controllers/cleanup.controllers.js";

const router = express.Router();

//Protected route
router.post("/cleanup-expired-appointments", cleanupExpiredAppointments);

export default router;
