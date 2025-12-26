// src/controllers/payment/verifyPaymentController.js
import crypto from "crypto";
import { razorpay } from "../../services/razorpayClient.js";
import { emailClient, sendEmail } from "../../services/emailService.js";
import { userPaymentReceiptTemplate } from "../../utils/userPaymentReceiptTemplate.js";
import { counsellorPaymentReceiptTemplate } from "../../utils/counsellorPaymentReceiptTemplate.js";
import {
  db as firestoreDb,
  adminDb as adminFirestoreDb,
} from "../../config/firebase.js";
import { appointmentConfirmationTemplate } from "../../utils/appointmentConfirmation.js";
import { counsellorNotificationTemplate } from "../../utils/counsellorNotification.js";

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

    /* --------------------------------------------------
       2. Resolve STUDENT (single source of truth)
    -------------------------------------------------- */
    const studentUid = aptData.studentUid || aptData.studentId || null;
    const studentEmail = aptData.studentEmail || null;
    let studentName = aptData.studentName || null;

    if (!studentName && studentUid) {
      try {
        const userSnap = await adminDb
          .collection("users")
          .doc(studentUid)
          .get();

        if (userSnap.exists) {
          const u = userSnap.data();
          studentName =
            u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || null;
        }
      } catch (err) {
        console.error("Failed to resolve student name:", err);
      }
    }

    /* --------------------------------------------------
       3. Resolve COUNSELLOR (name + email)
    -------------------------------------------------- */
    let counsellorName = null;
    let counsellorEmail = aptData.counsellorEmail || null;

    try {
      const counsellorSnap = await adminDb
        .collection("counsellors")
        .doc(aptData.counsellorId)
        .get();

      if (counsellorSnap.exists) {
        const c = counsellorSnap.data();

        counsellorName =
          `${c.profileData?.firstName || ""} ${
            c.profileData?.lastName || ""
          }`.trim() || null;

        counsellorEmail = counsellorEmail || c.email || null;
      }
    } catch (err) {
      console.error("Failed to resolve counsellor:", err);
    }

    /* --------------------------------------------------
       4. Idempotency guard
    -------------------------------------------------- */
    if (
      aptData.paymentStatus === "success" ||
      aptData.paymentDetails?.paymentId === razorpay_payment_id
    ) {
      return res
        .status(200)
        .json({ success: true, message: "Payment already processed" });
    }

    /* --------------------------------------------------
       5. Order ID consistency
    -------------------------------------------------- */
    console.log("ORDER MATCH CHECK", {
      dbOrderId: aptData.razorpayOrderId,
      incomingOrderId: razorpay_order_id,
    });

    if (!aptData.razorpayOrderId) {
      await appointmentRef.update({
        razorpayOrderId: razorpay_order_id,
      });
    } else if (aptData.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: "Order ID mismatch. Invalid payment attempt.",
      });
    }

    /* --------------------------------------------------
       6. Verify Razorpay signature
    -------------------------------------------------- */
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    /* --------------------------------------------------
       7. Fetch Razorpay order & payment
    -------------------------------------------------- */
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.order_id !== razorpay_order_id) {
      return res
        .status(400)
        .json({ success: false, message: "Payment does not belong to order" });
    }

    if (payment.status === "authorized") {
      payment = await razorpay.payments.capture(
        razorpay_payment_id,
        order.amount
      );
    }

    if (payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: `Invalid payment status: ${payment.status}`,
      });
    }

    /* --------------------------------------------------
       8. Build paymentDetails
    -------------------------------------------------- */
    const paymentDetails = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      amount: Number(order.amount), // paise
      currency: order.currency || "INR",
      status: payment.status,
      method: payment.method || null,
      captured: true,
      createdAt: new Date(),
      raw: {
        paymentId: payment.id,
        orderId: order.id,
        status: payment.status,
      },
    };

    /* --------------------------------------------------
       9. Update appointment
    -------------------------------------------------- */
    await appointmentRef.update({
      paymentStatus: "success",
      paymentDetails,
      "meta.status": "confirmed",
      paidAt: new Date(),
      updatedAt: new Date(),
    });

    /* --------------------------------------------------
       10. Payments master record
    -------------------------------------------------- */
    await adminDb
      .collection("payments")
      .doc(razorpay_payment_id)
      .set({
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        appointmentId,
        counsellorId: aptData.counsellorId,
        counsellorName,
        userId: studentUid,
        userEmail: studentEmail,
        userName: studentName,
        amountRupees: Number(order.amount) / 100,
        amountPaise: Number(order.amount),
        currency: order.currency || "INR",
        status: "success",
        method: payment.method || null,
        appointmentDate: aptData.date,
        timeSlot: aptData.timeSlot,
        source: "razorpay",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    /* --------------------------------------------------
       11. Subcollections (safe)
    -------------------------------------------------- */
    await adminDb
      .collection("counsellors")
      .doc(aptData.counsellorId)
      .collection("appointments")
      .doc(appointmentId)
      .set({ paymentStatus: "success", paymentDetails }, { merge: true });

    if (studentUid) {
      await adminDb
        .collection("users")
        .doc(studentUid)
        .collection("appointments")
        .doc(appointmentId)
        .set({ paymentStatus: "success", paymentDetails }, { merge: true });
    }

    /* --------------------------------------------------
       12. Email receipts (guarded)
    -------------------------------------------------- */
    const amountRupees = (order.amount / 100).toFixed(2);

    //  Appointment confirmation email TO USER
    try {
      const counsellorName =
        (counsellorData?.profileData?.firstName || "") +
        " " +
        (counsellorData?.profileData?.lastName || "");

      const html = appointmentConfirmationTemplate({
        studentName: user.name || user.email,
        counsellorName,
        date,
        timeSlot,
        zoomLink: actualZoomLink,
      });

      await emailClient.sendMail({
        from: `MINDSOUL <${process.env.MAIL_USER}>`,
        to: user.email,
        subject: "Hello User, Your Counselling Appointment is Confirmed",
        html,
      });
    } catch (mailErr) {
      console.error("Email sending failed:", mailErr);
    }

    //  Appointment confirmation email TO Counsellor

    try {
      const counsellorName =
        (counsellorData?.profileData?.firstName || "") +
        " " +
        (counsellorData?.profileData?.lastName || "");

      const counsellorEmailForMail = counsellorData?.email;

      const counsellorHtml = counsellorNotificationTemplate({
        counsellorName,
        studentName: user.name || user.email,
        studentEmail: user.email,
        date,
        timeSlot,
        startUrl: zoomMeeting.startUrl,
      });

      await emailClient.sendMail({
        from: `MINDSOUL <${process.env.MAIL_USER}>`,
        to: counsellorEmailForMail,
        subject: "Hello Counsellor, You have a new appointment",
        html: counsellorHtml,
      });
    } catch (cMailErr) {
      console.error("Counsellor email sending failed:", cMailErr);
    }

    if (studentEmail) {
      await sendEmail({
        to: studentEmail,
        subject: "Payment Receipt – MINDSOUL",
        html: userPaymentReceiptTemplate({
          studentName: studentName || "User",
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          amount: amountRupees,
          date: new Date().toLocaleString(),
        }),
      });
    }

    if (counsellorEmail) {
      await sendEmail({
        to: counsellorEmail,
        subject: "Payment Processed – MINDSOUL",
        html: counsellorPaymentReceiptTemplate({
          counsellorName: counsellorName || "Counsellor",
          studentName: studentName || "Student",
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          amount: amountRupees,
          date: new Date().toLocaleString(),
        }),
      });
    }

    return res
      .status(200)
      .json({ success: true, message: "Payment verified and recorded" });
  } catch (err) {
    console.error("Verify Payment Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

//test

// export const verifyRazorpayPayment = async (req, res) => {
//   try {
//     const {
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature,
//       appointmentId,
//     } = req.body ?? {};

//     console.log("VERIFY PAYMENT HIT", {
//       appointmentId,
//       razorpay_order_id,
//       razorpay_payment_id,
//     });

//     if (
//       !razorpay_order_id ||
//       !razorpay_payment_id ||
//       !razorpay_signature ||
//       !appointmentId
//     ) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing required fields" });
//     }

//     // 1) Fetch appointment
//     const appointmentRef = adminDb
//       .collection("appointments")
//       .doc(appointmentId);
//     const aptSnap = await appointmentRef.get();

//     if (!aptSnap.exists) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Appointment not found" });
//     }

//     const aptData = aptSnap.data();

//     // 2) Resolve STUDENT (correctly via studentUid)
//     const studentUid = aptData.studentUid || aptData.studentId || null;
//     const studentEmail = aptData.studentEmail || null;
//     let studentName = aptData.studentName || null;

//     if (!studentName && studentUid) {
//       try {
//         const userSnap = await adminDb
//           .collection("users")
//           .doc(studentUid)
//           .get();

//         if (userSnap.exists) {
//           const u = userSnap.data();
//           studentName =
//             u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || null;
//         }
//       } catch (err) {
//         console.error("Failed to resolve student name:", err);
//       }
//     }

//     // 3) Resolve COUNSELLOR (correctly via profileData)
//     let counsellorName = null;
//     let counsellorEmail = aptData.counsellorEmail || null;

//     try {
//       const counsellorSnap = await adminDb
//         .collection("counsellors")
//         .doc(aptData.counsellorId)
//         .get();

//       if (counsellorSnap.exists) {
//         const c = counsellorSnap.data();
//         counsellorName =
//           `${c.profileData?.firstName || ""} ${
//             c.profileData?.lastName || ""
//           }`.trim() || null;
//         counsellorEmail = counsellorEmail || c.email || null;
//       }
//     } catch (err) {
//       console.error("Failed to resolve counsellor:", err);
//     }

//     // 4) Idempotency
//     if (
//       aptData.paymentStatus === "success" ||
//       aptData.paymentDetails?.paymentId === razorpay_payment_id
//     ) {
//       return res
//         .status(200)
//         .json({ success: true, message: "Payment already processed" });
//     }

//     // 5) Order ID check
//     console.log("ORDER MATCH CHECK", {
//       dbOrderId: aptData.razorpayOrderId,
//       incomingOrderId: razorpay_order_id,
//     });

//     if (!aptData.razorpayOrderId) {
//       await appointmentRef.update({ razorpayOrderId: razorpay_order_id });
//     } else if (aptData.razorpayOrderId !== razorpay_order_id) {
//       return res.status(400).json({
//         success: false,
//         message: "Order ID mismatch. Invalid payment attempt.",
//       });
//     }

//     // 6) Signature verification
//     const expectedSignature = crypto
//       .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//       .update(`${razorpay_order_id}|${razorpay_payment_id}`)
//       .digest("hex");

//     if (expectedSignature !== razorpay_signature) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid signature" });
//     }

//     // 7) Fetch Razorpay data
//     const order = await razorpay.orders.fetch(razorpay_order_id);
//     const payment = await razorpay.payments.fetch(razorpay_payment_id);

//     if (payment.order_id !== razorpay_order_id) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Payment does not belong to order" });
//     }

//     if (payment.status === "authorized") {
//       await razorpay.payments.capture(razorpay_payment_id, order.amount);
//     }

//     if (payment.status !== "captured") {
//       return res.status(400).json({
//         success: false,
//         message: `Invalid payment status: ${payment.status}`,
//       });
//     }

//     // 8) Build paymentDetails
//     const paymentDetails = {
//       orderId: razorpay_order_id,
//       paymentId: razorpay_payment_id,
//       signature: razorpay_signature,
//       amount: Number(order.amount), // paise
//       currency: order.currency || "INR",
//       status: payment.status,
//       method: payment.method || null,
//       captured: true,
//       createdAt: new Date(),
//       raw: {
//   paymentId: payment.id,
//   orderId: order.id,
//   status: payment.status
// }
//     };

//     // 9) Update appointment
//     await appointmentRef.update({
//       paymentStatus: "success",
//       paymentDetails,
//       "meta.status": "confirmed",
//       paidAt: new Date(),
//       updatedAt: new Date(),
//     });

//     // 10) Payments (single source of truth)
//     await adminDb
//       .collection("payments")
//       .doc(razorpay_payment_id)
//       .set({
//         paymentId: razorpay_payment_id,
//         orderId: razorpay_order_id,
//         appointmentId,
//         counsellorId: aptData.counsellorId,
//         counsellorName,
//         userId: studentUid,
//         userEmail: studentEmail,
//         userName: studentName,
//         amountRupees: Number(order.amount) / 100,
//         amountPaise: Number(order.amount),
//         currency: order.currency || "INR",
//         status: "success",
//         method: payment.method || null,
//         appointmentDate: aptData.date,
//         timeSlot: aptData.timeSlot,
//         source: "razorpay",
//         createdAt: new Date(),
//         updatedAt: new Date(),
//       });

//     // 11) Subcollections (safe)
//     await adminDb
//       .collection("counsellors")
//       .doc(aptData.counsellorId)
//       .collection("appointments")
//       .doc(appointmentId)
//       .set({ paymentStatus: "success", paymentDetails }, { merge: true });

//     if (studentUid) {
//       await adminDb
//         .collection("users")
//         .doc(studentUid)
//         .collection("appointments")
//         .doc(appointmentId)
//         .set({ paymentStatus: "success", paymentDetails }, { merge: true });
//     }

//     // 12) Emails (guarded)
//     const amountRupees = (order.amount / 100).toFixed(2);

//  Appointment confirmation email TO USER
// try {
//   const counsellorName =
//     (counsellorData?.profileData?.firstName || "") +
//     " " +
//     (counsellorData?.profileData?.lastName || "");

//   const html = appointmentConfirmationTemplate({
//     studentName: user.name || user.email,
//     counsellorName,
//     date,
//     timeSlot,
//     zoomLink: actualZoomLink,
//   });

//   await emailClient.sendMail({
//     from: `MINDSOUL <${process.env.MAIL_USER}>`,
//     to: user.email,
//     subject: "Hello User, Your Counselling Appointment is Confirmed",
//     html,
//   });
// } catch (mailErr) {
//   console.error("Email sending failed:", mailErr);
// }

// //  Appointment confirmation email TO Counsellor

// try {
//   const counsellorName =
//     (counsellorData?.profileData?.firstName || "") +
//     " " +
//     (counsellorData?.profileData?.lastName || "");

//   const counsellorEmailForMail = counsellorData?.email;

//   const counsellorHtml = counsellorNotificationTemplate({
//     counsellorName,
//     studentName: user.name || user.email,
//     studentEmail: user.email,
//     date,
//     timeSlot,
//     startUrl: zoomMeeting.startUrl,
//   });

//   await emailClient.sendMail({
//     from: `MINDSOUL <${process.env.MAIL_USER}>`,
//     to: counsellorEmailForMail,
//     subject: "Hello Counsellor, You have a new appointment",
//     html: counsellorHtml,
//   });
// } catch (cMailErr) {
//   console.error("Counsellor email sending failed:", cMailErr);
// }

//     if (studentEmail) {
//       await sendEmail({
//         to: studentEmail,
//         subject: "Payment Receipt – MINDSOUL",
//         html: userPaymentReceiptTemplate({
//           studentName: studentName || "User",
//           paymentId: razorpay_payment_id,
//           orderId: razorpay_order_id,
//           amount: amountRupees,
//           date: new Date().toLocaleString(),
//         }),
//       });
//     }

//     if (counsellorEmail) {
//       await sendEmail({
//         to: counsellorEmail,
//         subject: "Payment Processed – MINDSOUL",
//         html: counsellorPaymentReceiptTemplate({
//           counsellorName: counsellorName || "Counsellor",
//           studentName: studentName || "Student",
//           paymentId: razorpay_payment_id,
//           orderId: razorpay_order_id,
//           amount: amountRupees,
//           date: new Date().toLocaleString(),
//         }),
//       });
//     }

//     return res
//       .status(200)
//       .json({ success: true, message: "Payment verified and recorded" });
//   } catch (err) {
//     console.error("Verify Payment Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// };
