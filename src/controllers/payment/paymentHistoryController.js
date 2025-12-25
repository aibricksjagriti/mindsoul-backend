import {
  db as firestoreDb,
  adminDb as adminFirestoreDb,
} from "../../config/firebase.js";

// resolve Firestore DB safely
const adminDb = adminFirestoreDb || firestoreDb || global.db;

// Get payment history for logged-in USER
export const getUserPayments = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.uid) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // fetch payments made by this user
    const snap = await adminDb
      .collection("payments")
      .where("userEmail", "==", req.user.email)
      .orderBy("createdAt", "desc")
      .get();

    // map response
    const payments = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      payments,
    });
  } catch (err) {
    console.error("getUserPayments error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user payments",
    });
  }
};

// Get payment history for logged-in COUNSELLOR
export const getCounsellorPayments = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.counsellorId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // fetch payments received by this counsellor
    const snap = await adminDb
      .collection("payments")
      .where("counsellorId", "==", req.user.counsellorId)
      .orderBy("createdAt", "desc")
      .get();

    // map response
    const payments = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      payments,
    });
  } catch (err) {
    console.error("getCounsellorPayments error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch counsellor payments",
    });
  }
};
