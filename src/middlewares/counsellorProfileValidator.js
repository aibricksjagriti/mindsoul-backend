import { buildSlotPlan } from "../timeslots/slotPlan.timeslots.js";

export const validateCounsellorProfile = (req, res, next) => {
  const body = req.body || {};
  const reject = (message) => res.status(400).json({ success: false, message });
  for (const field of ["firstName", "lastName", "phoneNumber", "description", "experience"]) {
    if (body[field] !== undefined && typeof body[field] !== "string") return reject(`${field} must be a string`);
  }
  for (const field of ["workingDays", "languages", "expertise", "focusAreas"]) {
    if (body[field] === undefined) continue;
    const values = Array.isArray(body[field]) ? body[field] : [body[field]];
    if (!values.every((value) => typeof value === "string")) return reject(`${field} must contain strings`);
    body[field] = values.map((value) => value.trim()).filter(Boolean);
  }
  if (body.workingDays?.some((day) => !["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].includes(day))) {
    return reject("Invalid working day");
  }
  if (body.slotDuration !== undefined &&
      (!Number.isInteger(Number(body.slotDuration)) || Number(body.slotDuration) <= 0 || Number(body.slotDuration) > 1440)) {
    return reject("Slot duration must be a positive integer in minutes, at most 1440");
  }
  if (body.workingHours !== undefined) {
    try {
      const hours = typeof body.workingHours === "string" ? JSON.parse(body.workingHours) : body.workingHours;
      if (!hours || typeof hours !== "object" || Array.isArray(hours) ||
          Object.keys(hours).some((period) => !["morning", "afternoon", "evening"].includes(period)) ||
          Object.values(hours).some((period) => !period || typeof period !== "object" || !period.start || !period.end)) {
        return reject("Working hours must contain valid start/end periods");
      }
      buildSlotPlan({ counsellorId: "validation", date: "2030-01-01", workingHours: hours, slotDuration: Number(body.slotDuration ?? 30) });
      body.workingHours = JSON.stringify(hours);
    } catch {
      return reject("Working hours must use valid, nonoverlapping HH:MM ranges");
    }
  }
  req.body = body;
  next();
};
