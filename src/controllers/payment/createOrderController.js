import { razorpay } from "../../services/razorpayClient.js";
import { db as adminDb } from "../../config/firebase.js";

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

    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: "appointmentId is required.",
      });
    }

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

    // Idempotency: Block double-payments explicitly
    if (appointmentData.paymentStatus === "success") {
      return res.status(400).json({
        success: false,
        message: "This appointment is already paid for.",
      });
    }

    // OWNERSHIP CHECK
    if (appointmentData.studentId !== user.uid) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to pay for this appointment",
      });
    }

    // SAFEGUARD: Guard against missing counsellorId for fatal 500 error blocking
    if (!appointmentData.counsellorId) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment data: missing counsellor ID.",
      });
    }

    // Fetch counsellor name for payment metadata
    const counsellorRef = adminDb
      .collection("counsellors")
      .doc(appointmentData.counsellorId);

    const counsellorSnap = await counsellorRef.get();

    if(!counsellorSnap.exists) {
      return res.status(400).json({
        success: false,
        message: "Counsellor not found"
      })
    }
    const c = counsellorSnap.data();
    
    const counsellorName =
      `${c?.profileData?.firstName || ""} ${
        c?.profileData?.lastName || ""
      }`.trim() || "Counsellor";

    // STRICT AMOUNT ENFORCEMENT: No live counsellor price fallbacks, use the locked-in appointment amount
    const amount = Number(appointmentData.amount);

    if (!amount || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: "Appointment must have a valid locked-in amount before checkout. Contact support.",
      });
    }

    // ABANDONED CART RESILIENCE: Instead of blocking them for having an existing order, reuse the existing un-paid order!
    if (appointmentData.razorpayOrderId) {
      try {
        const existingOrder = await razorpay.orders.fetch(appointmentData.razorpayOrderId);
        
        // If order exists and is unpaid, seamlessly return it
        if (existingOrder && (existingOrder.status === "created" || existingOrder.status === "attempted")) {
          return res.status(200).json({
            success: true,
            message: "Existing active Razorpay order retrieved",
            order: existingOrder,
            appointmentId,
            counsellorName,
          });
        }
        
        // If paid, block explicit retry
        if (existingOrder && existingOrder.status === "paid") {
           return res.status(400).json({
             success: false,
             message: "Payment already completed for this appointment",
           });
        }
      } catch (e) {
        console.warn("Could not fetch existing Razorpay order. Generating a new one gracefully.", e.message);
      }
    }

    // Razorpay only accepts amount in paise (₹1 = 100 paise)
    const options = {
      amount: Math.round(amount * 100),
      currency,
      receipt: `receipt_${appointmentId}`,
      payment_capture: 1,

      notes: {
        appointmentId,
        counsellorName,
        userId: user.uid,
      },
    };

    const order = await razorpay.orders.create(options);

    console.log("ORDER CREATED", {
      appointmentId,
      orderId: order.id,
      amount,
    });

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
    const amount = 500; // ₹500 fixed test amount
    const currency = "INR";

    if (!amount || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: "Amount is required and must be a number.",
      });
    }

    const options = {
      amount: Math.round(Number(amount) * 100), // 50000 paise
      currency,
      receipt: `test_receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    console.log("RAZORPAY TEST ORDER", {
      id: order.id,
      amount: order.amount,
      currency: order.currency,
    });

    return res.status(200).json({
      success: true,
      order,
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
