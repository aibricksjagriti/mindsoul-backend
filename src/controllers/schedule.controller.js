// src/controllers/schedule.controllers.js

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
    const weeklyData = req.body.weekly;

    if (!weeklyData) {
      return res.status(400).json({
        success: false,
        message: "weekly field is required",
      });
    }

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
    const { date, overrideType, periods } = req.body;

    if (!date || !overrideType) {
      return res.status(400).json({
        success: false,
        message: "date and overrideType are required",
      });
    }

    const result = await setDateException(counsellorId, date, {
      overrideType,
      periods: periods || null,
    });

    return res.status(200).json({
      success: true,
      message: "Date exception saved",
      ...result,
    });

  } catch (err) {
    console.error("Add date exception error:", err);
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
