import { db } from "../config/firebase.js";

export const requireCounsellorOwner = (req, res, next) => {
  const targetId = req.params.counsellorId || req.params.id || req.body?.counsellorId;
  if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (typeof targetId !== "string" || !targetId) {
    return res.status(400).json({ success: false, message: "Counsellor ID is required" });
  }
  if (req.user.role !== "admin" &&
      (req.user.role !== "counsellor" || req.user.counsellorId !== targetId)) {
    return res.status(403).json({ success: false, message: "You cannot manage this counsellor" });
  }
  next();
};

export const preserveCounsellorEmail = async (req, res, next) => {
  try {
    const snap = await db.collection("counsellors").doc(req.body.counsellorId).get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, message: "Counsellor record not found" });
    }
    const email = snap.data().email;
    if (typeof email !== "string" || !email.trim()) {
      return res.status(409).json({ success: false, message: "Counsellor email is not configured" });
    }
    if (req.body.email !== undefined &&
        (typeof req.body.email !== "string" ||
         req.body.email.trim().toLowerCase() !== email.trim().toLowerCase())) {
      return res.status(400).json({ success: false, message: "Login email cannot be changed through profile updates" });
    }
    req.body.email = email.trim().toLowerCase();
    next();
  } catch (error) {
    next(error);
  }
};
