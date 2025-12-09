// src/middlewares/cronAuth.middleware.js
export default function cronAuth(req, res, next) {
  try {
    const header = req.header("x-cron-secret") || req.header("X-Cron-Secret");
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      console.error("CRON_SECRET not set in environment");
      return res.status(500).json({ success: false, message: "Server misconfiguration" });
    }

    if (!header || header !== secret) {
      return res.status(401).json({ success: false, message: "Unauthorized (cron)" });
    }

    return next();
  } catch (err) {
    console.error("cronAuth error:", err);
    return res.status(500).json({ success: false, message: "Internal error" });
  }
}
