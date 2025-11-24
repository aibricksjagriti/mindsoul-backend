// src/controllers/timeslot.controllers.js

import { generateSlotsForDate } from "../timeslots/slotGenerator.timeslots.js";
import {
  getAvailableFutureSlots,
  deleteSlotsForDate,
} from "../timeslots/slotService.timeslots.js";
import { groupSlotsByPeriod } from "../timeslots/slotUtils.timeslots.js";
import admin from "firebase-admin";

const db = admin.firestore();

/**
 * -----------------------------------------------------------
 * GET AVAILABLE SLOTS (GROUPED FORMAT)
 * GET /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
 * -----------------------------------------------------------
 */
export const getAvailableSlots = async (req, res) => {
  try {
    const counsellorId = req.params.id?.trim().toLowerCase();
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

/**
 * -----------------------------------------------------------
 * GENERATE SLOTS FOR A SPECIFIC DAY
 * POST /api/timeslots/counsellor/:id/slots/generate
 * BODY: { date }
 * -----------------------------------------------------------
 */
export const generateSlotsForCounsellor = async (req, res) => {
  try {
    const counsellorId = req.params.id?.trim().toLowerCase();
    const { date } = req.body;

    if (!counsellorId || !date) {
      return res.status(400).json({
        success: false,
        message: "counsellorId and date are required",
      });
    }

    // Fetch counsellor profileData (for workingHours + slotDuration)
    const docRef = db.collection("counsellors").doc(counsellorId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return res.status(404).json({
        success: false,
        message: "Counsellor not found",
      });
    }

    const data = snap.data();
    const profile = data.profileData || {};

    if (!profile.workingHours || !profile.slotDuration) {
      return res.status(400).json({
        success: false,
        message:
          "Counsellor workingHours and slotDuration must be set before slot generation",
      });
    }

    // Delete old slots (optional but recommended)
    await deleteSlotsForDate(counsellorId, date);

    // Generate fresh slots
    const result = await generateSlotsForDate({
      counsellorId,
      date,
      workingHours: profile.workingHours,
      slotDuration: profile.slotDuration,
    });

    return res.status(200).json({
      success: true,
      message: "Slots generated successfully",
      details: result,
    });
  } catch (err) {
    console.error("generateSlotsForCounsellor error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate slots",
      error: err.message,
    });
  }
};

/**
 * -----------------------------------------------------------
 * DELETE ALL SLOTS FOR A DATE
 * DELETE /api/timeslots/counsellor/:id/slots?date=YYYY-MM-DD
 * -----------------------------------------------------------
 */
export const deleteSlots = async (req, res) => {
  try {
    const counsellorId = req.params.id?.trim().toLowerCase();
    const date = req.query.date;
    const period = req.query.period; // NEW

    if (!counsellorId || !date) {
      return res.status(400).json({
        success: false,
        message: "counsellorId and date are required",
      });
    }

    // ---------------------------------------------------------
    // NEW: DELETE specific period (morning/afternoon/evening)
    // ---------------------------------------------------------
    if (period) {
      const valid = ["morning", "afternoon", "evening"];

      if (!valid.includes(period)) {
        return res.status(400).json({
          success: false,
          message: "Invalid period. Use: morning, afternoon, evening",
        });
      }

      const slotsQuery = await adminDb
        .collection("timeSlots")
        .where("counsellorId", "==", counsellorId)
        .where("date", "==", date)
        .where("period", "==", period)
        .get();

      if (slotsQuery.empty) {
        return res.status(200).json({
          success: true,
          message: `No slots found for ${period} on ${date}`,
        });
      }

      const batch = adminDb.batch();
      slotsQuery.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      return res.status(200).json({
        success: true,
        message: `All ${period} slots deleted for ${date}`,
        deletedCount: slotsQuery.size,
      });
    }

    // ---------------------------------------------------------
    // ORIGINAL: DELETE ALL slots for a date
    // ---------------------------------------------------------
    await deleteSlotsForDate(counsellorId, date);

    return res.status(200).json({
      success: true,
      message: `All slots deleted for date: ${date}`,
    });
  } catch (err) {
    console.error("deleteSlots error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete slots",
      error: err.message,
    });
  }
};