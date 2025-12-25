import { razorpay } from "../../services/razorpayClient.js";
import { db as adminDb } from "../../config/firebase.js"; // NEW: import Firestore to fetch appointment

export const createRazorpayOrder = async (req, res) => {
  try {
    const user = req.user; //jwt authenticated user

    if (!user || !user.uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { appointmentId, currency = "INR" } = req.body;

    // NEW: appointmentId must be provided
    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: "appointmentId is required.",
      });
    }

    // NEW: Fetch appointment from Firestore
    const appointmentRef = adminDb
      .collection("appointments")
      .doc(appointmentId);
    const appointmentSnap = await appointmentRef.get();

    if (!appointmentSnap.exists) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const appointmentData = appointmentSnap.data();

    //OWNERSHIP CHECK (MUST BE HERE)

    if (appointmentData.studentUid !== user.uid) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to pay for this appointment",
      });
    }

    // Fetch counsellor name for payment display
    const counsellorRef = adminDb
      .collection("counsellors")
      .doc(appointmentData.counsellorId);

    const counsellorSnap = await counsellorRef.get();

    const c = counsellorSnap.data();
    const counsellorName =
      `${c?.profileData?.firstName || ""} ${
        c?.profileData?.lastName || ""
      }`.trim() || "Counsellor";

    //prefer appointment amount, fallback to counsellor price
    const amount = Number(
      appointmentData.amount ?? counsellorSnap.data()?.sessionPrice
    );

    //Prevent duplicate Razorpay orders
    if (appointmentData.razorpayOrderId) {
      return res.status(400).json({
        success: false,
        message: "Payment order already created for this appointment",
      });
    }

    if (!amount || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment amount. Contact support.",
      });
    }

    // Razorpay only accepts amount in paise (₹1 = 100 paise)
    const options = {
      amount: Math.round(amount * 100),
      currency,
      receipt: `receipt_${appointmentId}`,

      // ADD metadata
      notes: {
        appointmentId,
        counsellorName,
        userId: user.uid,
      },
    };

    const order = await razorpay.orders.create(options);

    await appointmentRef.update({
      razorpayOrderId: order.id,
      updatedAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Razorpay order created successfully",
      order,
      appointmentId,
      counsellorName,
    });
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Razorpay order",
      error: error.message,
    });
  }
};

// ------------------------------------------------------------
// TEST MODE: Razorpay Order Creation (No Auth, No Firestore)
// ------------------------------------------------------------

export const createRazorpayOrder_Test = async (req, res) => {
  try {
    // ❌ REMOVE amount from client in production
    // const { amount = 500, currency = "INR" } = req.body;

    //  TEMP TEST-ONLY FIX (explicit, predictable)
    // ⚠️ DO NOT USE THIS IN PRODUCTION
    const amount = 500; // ₹500 fixed test amount
    const currency = "INR";

    //  Defensive check (still fine)
    if (!amount || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: "Amount is required and must be a number.",
      });
    }

    //  Razorpay requires amount in paise (this part is CORRECT)
    const options = {
      amount: Math.round(Number(amount) * 100), // 50000 paise
      currency,
      receipt: `test_receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    //  LOG FOR DEBUG (ADD THIS)
    console.log("RAZORPAY TEST ORDER", {
      id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
    console.log("BACKEND RAZORPAY KEY:", process.env.RAZORPAY_KEY_ID);

    return res.status(200).json({
      success: true,
      order, // frontend already expects this shape

      // ❌ REMOVE THIS — frontend already has the key
      // key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Test Razorpay Order Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Razorpay test order",
      error: error.message,
    });
  }
};
