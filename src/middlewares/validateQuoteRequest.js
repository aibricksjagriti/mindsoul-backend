export const validateQuoteRequest = (req, res, next) => {
  const body = req.body || {};
  const reject = (message) => res.status(400).json({ success: false, message });
  for (const field of ["firstName", "lastName", "email", "phone", "country", "employees"]) {
    if (typeof body[field] !== "string" || !body[field].trim() || body[field].length > 300) return reject(`${field} is required and must be a valid string`);
    body[field] = body[field].trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return reject("Invalid email address");
  if (!/^\+?[\d\s()-]{10,25}$/.test(body.phone) || body.phone.replace(/\D/g, "").length < 10 || body.phone.replace(/\D/g, "").length > 15) return reject("Invalid phone number");
  for (const field of ["company", "jobTitle"]) {
    if (body[field] !== undefined && body[field] !== null && (typeof body[field] !== "string" || body[field].length > 300)) return reject(`${field} must be a string`);
  }
  if (body.allowCommunication !== undefined && typeof body.allowCommunication !== "boolean") return reject("allowCommunication must be a boolean");
  req.body = body;
  next();
};
