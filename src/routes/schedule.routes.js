// src/routes/schedule.routes.js

import express from "express";
import {
  getScheduleInfo,
  updateSchedule,
  addDateException,
  removeDateException,
} from "../controllers/schedule.controllers.js";

import { authenticate } from "../middlewares/auth.middlewares.js";

const router = express.Router();

/**
 * BASE: /api/schedule

 * GET    /:counsellorId                       → Get weekly schedule + time config
 * PATCH  /:counsellorId                       → Update weekly schedule
 * POST   /:counsellorId/exception             → Add/update date exception
 * DELETE /:counsellorId/exception/:date       → Remove date exception
 */

// Get schedule (weekly + time config)
router.get("/:counsellorId", authenticate, getScheduleInfo);

// Update weekly schedule
router.patch("/:counsellorId", authenticate, updateSchedule);

// Add or update date exception
router.post("/:counsellorId/exception", authenticate, addDateException);

// Delete an exception for a specific date
router.delete("/:counsellorId/exception/:date", authenticate, removeDateException);

export default router;
