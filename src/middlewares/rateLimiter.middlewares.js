import rateLimit from "express-rate-limit";

import rateLimit from "express-rate-limit";

export const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,                  // 5 attempts
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later."
  },
});
