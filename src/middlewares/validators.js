// src/middlewares/validators.js

export const validateCreateAppointment = (req, res, next) => {
  const { counsellorEmail, date, timeSlot } = req.body;

  // ---------------------------------------------------------
  // 1. Validate counsellorEmail
  // Must be a string and required
  // ---------------------------------------------------------
  if (!counsellorEmail || typeof counsellorEmail !== "string") {
    return res.status(400).json({ message: "counsellorEmail is required" });
  }

  // ---------------------------------------------------------
  // 2. Validate date
  // Must be a string and follow YYYY-MM-DD format
  // ---------------------------------------------------------
  if (!date || typeof date !== "string") {
    return res.status(400).json({ message: "date is required (YYYY-MM-DD)" });
  }

  // Basic date format check → YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res
      .status(400)
      .json({ message: "Invalid date format, expected YYYY-MM-DD" });
  }

  // ---------------------------------------------------------
  // 3. Validate timeSlot
  // Must be a string and follow "HH:MM-HH:MM" format
  // ---------------------------------------------------------
  if (!timeSlot || typeof timeSlot !== "string") {
    return res.status(400).json({
      message: "timeSlot is required (HH:MM-HH:MM)",
    });
  }

  // Regex for time range:
  // - start:  HH:MM (24-hour format)
  // - hyphen: -
  // - end:    HH:MM (24-hour format)
  //
  // Valid examples:
  // "09:00-09:30"
  // "14:15-15:00"
  //
  // Invalid examples:
  // "9:00-10:00" (missing leading zero)
  // "25:00-26:00" (invalid hour)
  // "09:00/09:30" (wrong separator)
  const timeSlotRegex = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timeSlotRegex.test(timeSlot)) {
    return res.status(400).json({
      message: "Invalid timeSlot format, expected HH:MM-HH:MM",
    });
  }

  // ---------------------------------------------------------
  // 4. If all validations pass, move to the next middleware
  // ---------------------------------------------------------
  next();
};
