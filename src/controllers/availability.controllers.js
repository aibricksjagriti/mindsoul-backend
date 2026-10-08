import { db } from "../config/firebase.js";
import { indiaDateString, isDateString, isFutureDateTime } from "../timeslots/slotUtils.timeslots.js";

export const getAvailabilitySummary = async (req, res, next) => {
  try {
    const from = req.query.from || indiaDateString();
    const days = Number(req.query.days ?? 45);
    if (!isDateString(from) || from < indiaDateString() || !Number.isInteger(days) || days < 1 || days > 45) {
      return res.status(400).json({ success: false, message: "Choose a valid upcoming date and a range of 1–45 days" });
    }
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + days - 1);
    const snapshot = await db.collection("timeSlots").where("counsellorId", "==", req.params.id)
      .where("date", ">=", from).where("date", "<=", end.toISOString().slice(0,10)).get();
    const counts = new Map();
    for (const doc of snapshot.docs) {
      const slot = doc.data();
      if (!slot.isBooked && isFutureDateTime(`${slot.date}T${slot.startTime}:00`)) counts.set(slot.date,(counts.get(slot.date) || 0) + 1);
    }
    const dates = [...counts].sort(([a],[b]) => a.localeCompare(b)).map(([date,count]) => ({ date, count }));
    res.json({ success: true, dates, nextAvailableDate: dates[0]?.date || null, timezone: "Asia/Kolkata" });
  } catch (error) { next(error); }
};
