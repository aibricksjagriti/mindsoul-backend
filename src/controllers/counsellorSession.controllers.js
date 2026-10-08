import { db } from "../config/firebase.js";

export const getCounsellorSession = async (req, res, next) => {
  try {
    if (req.user?.role !== "counsellor" || !req.user.counsellorId) {
      return res.status(403).json({ success: false, message: "Counsellor session required" });
    }
    const snapshot = await db.collection("counsellors").doc(req.user.counsellorId).get();
    if (!snapshot.exists || snapshot.data().isVerified !== true) {
      return res.status(401).json({ success: false, message: "Counsellor session is no longer valid" });
    }
    return res.json({ success: true, counsellorId: snapshot.id, role: "counsellor" });
  } catch (error) {
    next(error);
  }
};
