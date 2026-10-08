// src/routes/schedule.routes.js

import express from "express";
import {
  getScheduleInfo,
  updateSchedule,
  addDateException,
  removeDateException,
  getScheduleExceptionInfo,
} from "../controllers/schedule.controllers.js";

import { authenticate } from "../middlewares/auth.middlewares.js";
import { requireCounsellorOwner } from "../middlewares/counsellorAccess.middlewares.js";

const router = express.Router();

/**
 * BASE: /api/schedule

 * GET    /:counsellorId                       → Get weekly schedule + time config
 * PATCH  /:counsellorId                       → Update weekly schedule
 * POST   /:counsellorId/exception             → Add/update date exception
 * DELETE /:counsellorId/exception/:date       → Remove date exception
 */

// Get schedule (weekly + time config)
router.get("/:counsellorId",  getScheduleInfo);

// Get schedule exceptions — for dashboard exceptions
router.get("/exceptions/:counsellorId", authenticate, requireCounsellorOwner, getScheduleExceptionInfo);

// Update weekly schedule
router.patch("/:counsellorId", authenticate, requireCounsellorOwner, updateSchedule);

// Add or update date exception
router.post("/:counsellorId/exception", authenticate, requireCounsellorOwner, addDateException);

// Delete an exception for a specific date
router.delete("/:counsellorId/exception/:date", authenticate, requireCounsellorOwner, removeDateException);

export default router;
