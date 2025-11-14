// src/middlewares/auth.middleware.js
import jwt from "jsonwebtoken";

export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

    const decoded = jwt.verify(token, JWT_SECRET);  

    // Support both email/password users (`id`) and google users (`uid`)
    req.user = {
      uid: decoded.uid || decoded.id,   // normalize id field
      email: decoded.email || null,
      name: decoded.name || null,
      role: "user"  // Universal role unless you set custom roles later
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
