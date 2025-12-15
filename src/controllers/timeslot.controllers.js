// src/controllers/timeslot.controllers.js

import { generateSlotsForDate } from "../timeslots/slotGenerator.timeslots.js";
import { generateSmartSlotsForDate } from "../services/timeslotGenerator.service.js";
import { getWeeklySchedule } from "../services/schedule.service.js";
import {
  getAvailableFutureSlots,
} from "../timeslots/slotService.timeslots.js";
import { groupSlotsByPeriod } from "../timeslots/slotUtils.timeslots.js";
import admin from "firebase-admin";
import { adminDb } from "../config/firebase.js";
const db = admin.firestore();

/**
 * -----------------------------------------------------------
 * GET AVAILABLE SLOTS (GROUPED FORMAT)
 * GET /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
 * -----------------------------------------------------------
 */
export const getAvailableSlots = async (req, res) => {
  try {
    const counsellorId = req.params.id;
    const date = req.query?.date;

    if (!counsellorId || !date) {
      return res.status(400).json({
        success: false,
        message: "counsellorId and date are required",
      });
    }

    // Fetch only available + future slots
    const available = await getAvailableFutureSlots(counsellorId, date);

    // Group into morning / afternoon / evening
    const grouped = groupSlotsByPeriod(available);

    return res.status(200).json({
      success: true,
      date,
      slots: grouped,
    });
  } catch (err) {
    console.error("getAvailableSlots error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch available slots",
      error: err.message,
    });
  }
};


// ----------------------------------------------
// GET ALL BOOKED SLOTS FOR A COUNSELLOR + DATE
// ----------------------------------------------
export const getBookedSlots = async (req, res) => {
  try {
    const counsellorId = req.params.id;
    const date = req.query.date;

    if (!counsellorId || !date) {
      return res.status(400).json({
        success: false,
        message: "counsellorId and date are required",
      });
    }

    const snap = await adminDb
      .collection("timeSlots")
      .where("counsellorId", "==", counsellorId)
      .where("date", "==", date)
      .where("isBooked", "==", true)
      .get();

    const booked = snap.docs.map((doc) => doc.data());

    return res.json({
      success: true,
      date,
      bookedSlots: booked.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        period: s.period,
      })),
    });
  } catch (err) {
    console.error("getBookedSlots error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch booked slots",
      error: err.message,
    });
  }
};


/**
 * ===========================================================
 * SMART WEEKLY GENERATION — GENERATE NEXT 7 DAYS
 * POST /api/timeslots/counsellor/:id/generate-week
 * ===========================================================
 */
export const generateNext7Days = async (req, res) => {
  try {
    const counsellorId = req.params.id;

    // Ensure weekly schedule exists
    const weekly = await getWeeklySchedule(counsellorId);
    if (!weekly) {
      return res.status(400).json({
        success: false,
        message: "Set weekly schedule first",
      });
    }

    const today = new Date();
    const responses = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);

      const dateStr = d.toISOString().split("T")[0];

      const result = await generateSmartSlotsForDate(counsellorId, dateStr);
      responses.push({ date: dateStr, ...result });
    }

    return res.json({
      success: true,
      message: "7-day smart generation complete",
      results: responses,
    });
  } catch (err) {
    console.error("generateNext7Days error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate next 7 days",
      error: err.message,
    });
  }
};

/**
 * ===========================================================
 * REFRESH A SINGLE DATE
 * POST /api/timeslots/counsellor/:id/refresh?date=YYYY-MM-DD
 * ===========================================================
 */
export const refreshDate = async (req, res) => {
  try {
    const counsellorId = req.params.id;
    const dateStr = req.query.date;

    if (!dateStr) {
      return res.status(400).json({
        success: false,
        message: "date is required",
      });
    }

    const result = await generateSmartSlotsForDate(counsellorId, dateStr);

    return res.json({
      success: true,
      message: "Date refreshed",
      date: dateStr,
      result,
    });
  } catch (err) {
    console.error("refreshDate error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to refresh date",
      error: err.message,
    });
  }
};

/**
 * ===========================================================
 * CRON JOB — DAILY ROLLING 7 DAYS GENERATION
 * ===========================================================
 */
export const cronGenerateNext7Days = async (req, res) => {
  try {
    // 1️⃣ Fetch all active, verified counsellors
    const counsellorsSnap = await db
      .collection("counsellors")
      .where("isVerified", "==", true)
      .where("profileCompleted", "==", true)
      .get();

    if (counsellorsSnap.empty) {
      return res.json({
        success: true,
        message: "CRON: No eligible counsellors found",
      });
    }

    const today = new Date();
    const results = [];

    // 2️⃣ Loop counsellors
    for (const doc of counsellorsSnap.docs) {
      const counsellorId = doc.id;

      const weekly = await getWeeklySchedule(counsellorId);
      if (!weekly) continue; // skip safely

      // 3️⃣ Generate rolling 7 days
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const ds = d.toISOString().split("T")[0];

        await generateSmartSlotsForDate(counsellorId, ds);
      }

      results.push(counsellorId);
    }

    return res.json({
      success: true,
      message: "CRON: 7-day rolling generation complete",
      counsellorsProcessed: results.length,
    });
  } catch (err) {
    console.error("cronGenerateNext7Days error:", err);
    return res.status(500).json({
      success: false,
      message: "Cron generation failed",
      error: err.message,
    });
  }
};
