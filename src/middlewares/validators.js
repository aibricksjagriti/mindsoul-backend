// src/middlewares/validators.js

export const validateCreateAppointment = (req, res, next) => {
  const { counsellorEmail, date, time } = req.body;

  if (!counsellorEmail || typeof counsellorEmail !== "string") {
    return res.status(400).json({ message: "counsellorEmail is required" });
  }

  if (!date || typeof date !== "string") {
    return res.status(400).json({ message: "date is required (YYYY-MM-DD)" });
  }

  // Simple date format check
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({ message: "Invalid date format, expected YYYY-MM-DD" });
  }

  if (!time || typeof time !== "string") {
    return res.status(400).json({ message: "time is required (HH:MM)" });
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(time)) {
    return res.status(400).json({ message: "Invalid time format, expected HH:MM" });
  }

  next();
};
