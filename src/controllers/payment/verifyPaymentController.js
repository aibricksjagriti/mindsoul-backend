// src/controllers/payment/verifyPaymentController.js
import crypto from "crypto";
import { razorpay } from "../../services/razorpayClient.js";
import { sendEmail } from "../../services/emailService.js";
import { userPaymentReceiptTemplate } from "../../utils/userPaymentReceiptTemplate.js";
import { counsellorPaymentReceiptTemplate } from "../../utils/counsellorPaymentReceiptTemplate.js";
import {
  db as firestoreDb,
  adminDb as adminFirestoreDb,
} from "../../config/firebase.js";

// Resolve Firestore DB reference (support both exports)
const adminDb = adminFirestoreDb || firestoreDb || global.db;

export const verifyRazorpayPayment = async (req, res) => {
  try {
    // Auth check (route protected by authenticate middleware)
    const user = req.user;
    if (!user || !user.uid) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      appointmentId,
    } = req.body ?? {};

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

    // Locate appointment (root collection: appointments/{appointmentId})
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

    // Idempotency: if already marked paid or payment recorded with same payment id, return success
    if (
      aptData.paymentStatus === "success" ||
      (aptData.paymentDetails &&
        aptData.paymentDetails.paymentId === razorpay_payment_id)
    ) {
      return res
        .status(200)
        .json({ success: true, message: "Payment already processed" });
    } 


//Block mismatched frontend-sent orderId
    if (aptData.razorpayOrderId && aptData.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: "Order ID mismatch. Invalid payment attempt.",
      });
    }

    // 1) Verify signature using HMAC SHA256
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    // 2) Fetch Razorpay order & payment (validate amounts & ownership)
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    // Ensure payment belongs to order
    if (payment.order_id !== razorpay_order_id) {
      return res
        .status(400)
        .json({ success: false, message: "Payment does not belong to order" });
    }

    //  Enforce backend-controlled sessionPrice (tamper-proof)
    if (aptData.amount != null) {
      //  Convert rupees → paise
      const expectedPaise = Math.round(Number(aptData.amount) * 100);

      //  Compare Razorpay order amount vs stored backend amount
      if (Number(order.amount) !== expectedPaise) {
        return res.status(400).json({
          success: false,
          message: "Amount mismatch",
        });
      }
    }

    // 3) Capture if authorized (in test mode Razorpay may already be captured)
    if (payment.status === "authorized") {
      await razorpay.payments.capture(razorpay_payment_id, order.amount);
      // re-fetch payment to reflect capture status
      // eslint-disable-next-line no-await-in-loop
      const updatedPayment = await razorpay.payments.fetch(razorpay_payment_id);
      if (updatedPayment.status !== "captured") {
        return res
          .status(400)
          .json({ success: false, message: "Failed to capture payment" });
      }
      // set payment var to updatedPayment so subsequent checks use final status
      // eslint-disable-next-line prefer-destructuring
      Object.assign(payment, updatedPayment);
    }

    // Accept captured or authorized (if capture step not needed)
    if (!(payment.status === "captured" || payment.status === "authorized")) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Invalid payment status: ${payment.status}`,
        });
    }

    // 4) Build paymentDetails object
    const paymentDetails = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      amount: Number(order.amount), // paise
      currency: order.currency || "INR",
      status: payment.status,
      method: payment.method || null,
      captured: payment.captured ?? payment.status === "captured",
      createdAt: new Date(),
      raw: {
        order,
        payment,
      },
    };

    // 5) Update appointment document atomically
    await appointmentRef.update({
      paymentStatus: "success",
      paymentDetails,
      "meta.status": "confirmed",
      paidAt: new Date(),
      updatedAt: new Date(),
    });


    // ⭐ NEW: Update counsellor's subcollection appointment doc
const counsellorSubRef = adminDb
  .collection("counsellors")
  .doc(aptData.counsellorId)
  .collection("appointments")
  .doc(appointmentId);

await counsellorSubRef.update({
  paymentStatus: "success",
  paymentDetails,
  paidAt: new Date(),
  updatedAt: new Date(),
});

// ⭐ NEW: Update user's subcollection appointment doc
const userSubRef = adminDb
  .collection("users")
  .doc(user.uid)
  .collection("appointments")
  .doc(appointmentId);

await userSubRef.update({
  paymentStatus: "success",
  paymentDetails,
  paidAt: new Date(),
  updatedAt: new Date(),
});


    // student info
    const studentEmail = aptData.studentEmail || aptData.student?.email || null;
    const studentId = aptData.studentId || aptData.student?.id || null;
    let studentName = aptData.studentName || aptData.student?.name || null;

    if (!studentName && studentId) {
      try {
        const userRef = adminDb.collection("users").doc(studentId);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          const u = userSnap.data();
          studentName =
            u.name ||
            `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
            studentName;
        }
      } catch (err) {
        console.error("Failed to fetch student name:", err);
      }
    }

    const counsellorEmail =
      aptData.counsellorEmail || aptData.counsellorId || null;
    let counsellorName = null;
    if (aptData.counsellorProfileSnapshot) {
      const cps = aptData.counsellorProfileSnapshot;
      counsellorName = `${(cps.firstName || "").trim()} ${(
        cps.lastName || ""
      ).trim()}`.trim();
    } else if (aptData.counsellorName) {
      counsellorName = aptData.counsellorName;
    } else {
      if (counsellorEmail) {
        try {
          const q = await adminDb
            .collection("users")
            .where("email", "==", counsellorEmail)
            .limit(1)
            .get();
          if (!q.empty) {
            const doc = q.docs[0].data();
            counsellorName =
              doc.name || `${doc.firstName || ""} ${doc.lastName || ""}`.trim();
          }
        } catch (err) {
          console.error("Failed to fetch counsellor name:", err);
        }
      }
    }

    const appointmentDate = aptData.date || "";
    const timeSlot = aptData.timeSlot || "";
    const amountRupees = (Number(paymentDetails.amount) / 100).toFixed(2);

    // 7) Send payment receipt emails (user + counsellor)
    try {
      if (studentEmail) {
        const htmlUserPayment = userPaymentReceiptTemplate({
          studentName: studentName || "User",
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          amount: amountRupees,
          date: new Date().toLocaleString(),
        });

        await sendEmail({
          to: studentEmail,
          subject: "Payment Receipt – MINDSOUL",
          html: htmlUserPayment,
        });
      }
    } catch (err) {
      console.error("Failed to send user payment receipt:", err);
    }

    try {
      if (counsellorEmail) {
        const htmlCounsellorPayment = counsellorPaymentReceiptTemplate({
          counsellorName: counsellorName || "Counsellor",
          studentName: studentName || "Student",
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          amount: amountRupees,
          date: new Date().toLocaleString(),
        });

        await sendEmail({
          to: counsellorEmail,
          subject: "Payment Processed – MINDSOUL",
          html: htmlCounsellorPayment,
        });
      }
    } catch (err) {
      console.error("Failed to send counsellor payment receipt:", err);
    }

    return res
      .status(200)
      .json({ success: true, message: "Payment verified and recorded" });
  } catch (err) {
    console.error("Verify Payment Error:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
  }
};
