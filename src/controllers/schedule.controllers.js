// src/controllers/schedule.controllers.js

import { db } from "../config/firebase.js";
import {
  getWeeklySchedule,
  updateWeeklySchedule,
  getDateException,
  setDateException,
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
      weekly: weekly?.weekly || null,
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
    const { date, overrideType, morning, afternoon, evening } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "date is required",
      });
    }

    const ref = db.collection("counsellors").doc(counsellorId);

    // Build exception object
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
        evening: evening ?? null
      };
    }

    // Write into root document using a MAP field
    await ref.set(
      {
        scheduleExceptions: {
          [date]: exceptionData
        }
      },
      { merge: true }
    );

    return res.json({
      success: true,
      message: "Date exception saved"
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
