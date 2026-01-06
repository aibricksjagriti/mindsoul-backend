// src/controllers/schedule.controllers.js

import { db } from "../config/firebase.js";
import {
  getWeeklySchedule,
  updateWeeklySchedule,
  deleteDateException,
  getCounsellorTimeConfig,
} from "../services/schedule.service.js";

/**
 * ---------------------------------------------------------
 * GET Weekly Schedule + Time Config + Exceptions (optional)
 * ---------------------------------------------------------
 * Returns everything frontend needs to render the schedule UI.
 */
export const getScheduleInfo = async (req, res) => {
  try {
    const counsellorId = req.params.counsellorId;

    const weekly = await getWeeklySchedule(counsellorId);
    const timeConfig = await getCounsellorTimeConfig(counsellorId);

    return res.status(200).json({
      success: true,
      weekly: weekly || null,
      weeklySchedule: weekly || null,

      timeConfig,
    });
  } catch (err) {
    console.error("GET schedule info error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * ---------------------------------------------------------
 * PATCH Weekly Schedule
 * ---------------------------------------------------------
 */
export const updateSchedule = async (req, res) => {
  try {
    const counsellorId = req.params.counsellorId;

    //  Accept either "weekly" (legacy) OR "schedulePreferences" (frontend-friendly)
    const weeklyFromBody = req.body?.weekly;
    const prefsFromBody = req.body?.schedulePreferences;

    //  Prefer schedulePreferences if provided, otherwise fall back to weekly
    const incoming = prefsFromBody ?? weeklyFromBody;

    if (!incoming || typeof incoming !== "object") {
      return res.status(400).json({
        success: false,
        message:
          "Request body must include 'schedulePreferences' or 'weekly' object",
      });
    }

    //  Basic validation: ensure there is at least one day key
    const dayKeys = Object.keys(incoming);
    if (dayKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provided schedule object is empty",
      });
    }

    //  Optional: normalize keys (frontend might send lowercase days)
    // We keep whatever keys were sent but it's common to send Monday..Sunday
    const weeklyData = {};
    for (const k of dayKeys) {
      const val = incoming[k];
      if (typeof val !== "object") {
        return res.status(400).json({
          success: false,
          message: `Invalid value for day '${k}' — expected an object with period booleans`,
        });
      }
      // You can add additional validation here for morning/afternoon/evening keys if desired
      weeklyData[k] = val;
    }

    // Call service unchanged (service expects the weekly object)
    const result = await updateWeeklySchedule(counsellorId, weeklyData);

    return res.status(200).json({
      success: true,
      message: "Weekly schedule updated",
      ...result,
    });
  } catch (err) {
    console.error("Update schedule error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * ---------------------------------------------------------
 * POST Add/Update Date Exception
 * ---------------------------------------------------------
 */
export const addDateException = async (req, res) => {
  try {
    const counsellorId = req.params.counsellorId;
    const { date, overrideType, morning, afternoon, evening, force } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "date is required",
      });
    }

    const counsellorRef = db.collection("counsellors").doc(counsellorId);

    /**
     * ---------------------------------------------------------
     * Check for already booked slots on this date
     * ---------------------------------------------------------
     * Booked appointments must NEVER be deleted or cancelled.
     * If bookings exist, warn counsellor unless force=true.
     */
    const bookedSnap = await db
      .collection("timeSlots")
      .where("counsellorId", "==", counsellorId)
      .where("date", "==", date)
      .get();

    const hasBookings = !bookedSnap.empty;

    // If bookings exist and counsellor has NOT confirmed force
    if (hasBookings && !force) {
      return res.status(200).json({
        success: false,
        requiresConfirmation: true,
        bookedCount: bookedSnap.size,
        message:
          "You already have booked appointments on this date. Adding an exception will block new bookings, but you must still attend existing appointments. Do you want to continue?",
      });
    }

    /**
     * ---------------------------------------------------------
     * Build exception object
     * ---------------------------------------------------------
     */
    let exceptionData = {};

    // FULL DAY OFF
    if (overrideType === "off") {
      exceptionData = { off: true };
    }
    // CUSTOM PARTIAL OVERRIDE
    else {
      exceptionData = {
        morning: morning ?? null,
        afternoon: afternoon ?? null,
        evening: evening ?? null,
      };
    }

    /**
     * ---------------------------------------------------------
     * Save exception into counsellor document (MAP field)
     * ---------------------------------------------------------
     */
    await counsellorRef.set(
      {
        scheduleExceptions: {
          [date]: exceptionData,
        },
      },
      { merge: true }
    );

    return res.json({
      success: true,
      message: hasBookings
        ? "Date exception saved. Existing appointments are preserved."
        : "Date exception saved",
    });

  } catch (err) {
    console.error("Add exception error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * ---------------------------------------------------------
 * DELETE a Date Exception
 * ---------------------------------------------------------
 */
export const removeDateException = async (req, res) => {
  try {
    const counsellorId = req.params.counsellorId;
    const date = req.params.date;

    const result = await deleteDateException(counsellorId, date);

    return res.status(200).json({
      success: true,
      message: "Date exception removed",
      ...result,
    });
  } catch (err) {
    console.error("Delete date exception error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * ---------------------------------------------------------
 * GET Counsellor Schedule + Exceptions
 * ---------------------------------------------------------
 * This is used by the counsellor dashboard.
 * It returns schedule-related configuration with SAFE defaults.
 */
export const getScheduleExceptionInfo = async (req, res) => {
  try {
    const { counsellorId } = req.params;

    if (!counsellorId) {
      return res.status(400).json({
        success: false,
        message: "counsellorId is required",
      });
    }

    const ref = adminDb.collection("counsellors").doc(counsellorId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({
        success: false,
        message: "Counsellor not found",
      });
    }

    const data = snap.data();

    //frontend should never get undefined
    const schedule = {
      weeklySchedule: data.weeklySchedule || {},
      workingHours: data.workingHours || {},
      slotDuration: data.slotDuration || null,
      scheduleExceptions: data.scheduleExceptions || {},
    };

    return res.status(200).json({
      success: true,
      schedule,
    });
  } catch (err) {
    console.error("getScheduleExceptionInfo error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch schedule exceptions",
      error: err.message,
    });
  }
};
