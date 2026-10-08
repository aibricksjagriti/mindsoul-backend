import { generateSlotsForDate } from "../timeslots/slotGenerator.timeslots.js";

export const generateSmartSlotsForDate = async (counsellorId, dateStr) => {
  return generateSlotsForDate({ counsellorId, date: dateStr, useCounsellorSchedule: true });
};
