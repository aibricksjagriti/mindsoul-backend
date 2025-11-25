// src/middlewares/userProfileValidator.js

export const validateUserProfile = (req, res, next) => {
  const { age, gender, phone, medications, medicalHistory } = req.body;

  // Required fields
  if (!age || !gender || !phone) {
    return res.status(400).json({
      success: false,
      message: "age, gender, and phone are required",
    });
  }

  // Age: must be a number and within valid range
  if (isNaN(age) || age < 1 || age > 120) {
    return res.status(400).json({
      success: false,
      message: "Invalid age. Must be a number between 1 and 120.",
    });
  }

  // Gender validation
  const allowedGenders = ["male", "female", "other"];
  if (!allowedGenders.includes(gender.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "Invalid gender. Allowed: male, female, other.",
    });
  }

  // Phone validation: must be 10 digits
  const phoneRegex = /^[0-9]{10}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({
      success: false,
      message: "Invalid phone number. Must be 10 digits.",
    });
  }

  // medications: must be string or array
  if (
    medications &&
    !Array.isArray(medications) &&
    typeof medications !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "medications must be a string or an array",
    });
  }

  // medicalHistory: must be string or array
  if (
    medicalHistory &&
    !Array.isArray(medicalHistory) &&
    typeof medicalHistory !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "medicalHistory must be a string or an array",
    });
  }

  next();
};
