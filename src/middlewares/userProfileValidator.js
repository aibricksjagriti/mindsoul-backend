export const validateUserProfile = (req, res, next) => {
  const body = req.body || {};
  const { age, gender, phone, medications, medicalHistory } = body;
  const reject = (message) => res.status(400).json({ success: false, message });
  if (!["string", "number"].includes(typeof age) || !Number.isInteger(Number(age)) || Number(age) < 1 || Number(age) > 120) {
    return reject("Age must be an integer between 1 and 120");
  }
  if (typeof gender !== "string" || !["male", "female", "other"].includes(gender.trim().toLowerCase())) {
    return reject("Gender must be male, female, or other");
  }
  if (typeof phone !== "string" || !/^\d{10}$/.test(phone.trim())) return reject("Phone must be a 10-digit string");
  for (const [field, value] of Object.entries({ medications, medicalHistory })) {
    if (value !== undefined && value !== null && typeof value !== "string" &&
        !(Array.isArray(value) && value.every((item) => typeof item === "string"))) {
      return reject(`${field} must be a string or an array of strings`);
    }
  }
  req.body = { ...body, age: Number(age), gender: gender.trim().toLowerCase(), phone: phone.trim() };
  next();
};
