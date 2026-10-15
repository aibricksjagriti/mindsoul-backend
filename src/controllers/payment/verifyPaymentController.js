import crypto from "crypto";
import { razorpay } from "../../services/razorpayClient.js";
import {
  db as firestoreDb,
  adminDb as adminFirestoreDb,
} from "../../config/firebase.js";

// Resolve Firestore DB reference (support both exports)
const adminDb = adminFirestoreDb || firestoreDb || global.db;

//production
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      appointmentId,
    } = req.body ?? {};

    console.log("VERIFY PAYMENT HIT", {
      appointmentId,
      razorpay_order_id,
      razorpay_payment_id,
    });

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !appointmentId
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    /* --------------------------------------------------
       1. Fetch appointment
    -------------------------------------------------- */
    const appointmentRef = adminDb
      .collection("appointments")
      .doc(appointmentId);

    const aptSnap = await appointmentRef.get();

    if (!aptSnap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });
    }

    const aptData = aptSnap.data();
    if (!req.user?.uid || req.user.role !== "user" || aptData.studentId !== req.user.uid) return res.status(403).json({ success: false, message: "You cannot verify another user's appointment" });

    if (aptData.bookingType === "complimentary" || (aptData.razorpayOrderId || aptData.orderId) !== razorpay_order_id) return res.status(400).json({ success: false, message: "Order does not belong to appointment" });

    /* --------------------------------------------------
       2. Verify Razorpay signature
    -------------------------------------------------- */
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (typeof razorpay_signature !== "string" || !/^[a-f0-9]{64}$/i.test(razorpay_signature) || !crypto.timingSafeEqual(Buffer.from(expectedSignature, "hex"), Buffer.from(razorpay_signature, "hex"))) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    /* --------------------------------------------------
       3. Fetch Razorpay order & payment
    -------------------------------------------------- */
    const order = await razorpay.orders.fetch(razorpay_order_id);
    let payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (order.notes?.appointmentId !== appointmentId || order.currency !== "INR" || payment.currency !== "INR" || !Number.isFinite(Number(aptData.amount)) || Number(aptData.amount) <= 0 || order.amount !== Math.round(Number(aptData.amount) * 100) || payment.amount !== order.amount || (aptData.paymentStatus === "success" && (aptData.paymentId || aptData.paymentDetails?.paymentId) !== razorpay_payment_id)) return res.status(400).json({ success: false, message: "Payment does not match appointment" });

    if (payment.order_id !== razorpay_order_id) {
      return res
        .status(400)
        .json({ success: false, message: "Payment does not belong to order" });
    }

    // Capture logic strategically removed here. Kept read-only. We allow webhook to capture.
    if (payment.status !== "captured" && payment.status !== "authorized") {
      return res.status(400).json({
        success: false,
        message: `Invalid payment status: ${payment.status}`,
      });
    }

    /* --------------------------------------------------
       4. Return Success to Frontend
       (All DB writes & Emails are handled by the Webhook)
    -------------------------------------------------- */
    
    // We send back the existing appointment data.
    // The frontend should know that success: true means the payment is captured,
    // and the system is processing the slot booking asynchronously via webhook.

    console.log("VERIFY SUCCESS", {
      appointmentId,
      paymentStatus: payment.status,
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully. Booking is being processed.",
      paymentStatus: payment.status,
      appointment: aptData,
    });
  } catch (err) {
    console.error("Verify Payment Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
