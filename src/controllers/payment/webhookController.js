import crypto from "crypto";
import { db as adminDb } from "../../config/firebase.js";
import admin from "firebase-admin";
import { razorpay } from "../../services/razorpayClient.js";

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

export const razorpayWebhook = async (req, res) => {
  try {
    /* ============================================================
      1  VERIFY WEBHOOK SIGNATURE (AUTHENTICITY CHECK)
    ============================================================ */

    const rawBody = req.rawBody;
    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).send("No signature header");
    }

    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) {
      console.error("Webhook signature mismatch");
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(rawBody);

    /* ============================================================
      2 EXTRACT EVENT + PAYMENT ENTITY
    ============================================================ */
    const event = payload.event;
    const payment = payload.payload?.payment?.entity;

    // If no payment object,ensure payment exists
    if (!payment) {
      return res.status(200).send("No payment entity");
    }

    /* ============================================================
      3  RESOLVE appointmentId FROM ORDER.receipt
           (receipt format enforced: receipt_<appointmentId>)
    ============================================================ */
    let appointmentId = null;

    try {
      const razorpayOrder = await razorpay.orders.fetch(payment.order_id);

      if (
        razorpayOrder?.receipt &&
        razorpayOrder.receipt.startsWith("receipt_")
      ) {
        appointmentId = razorpayOrder.receipt.replace("receipt_", "").trim();
      }
    } catch (err) {
      console.error("Failed to fetch order in webhook:", err);
    }

    //safety check
    if (!appointmentId) {
      console.warn("No appointmentId found in webhook (order.receipt missing)");
      return res.status(200).send("OK");
    }

    /* ============================================================
      4  FETCH APPOINTMENT (SOURCE OF TRUTH)
    ============================================================ */

    const appointmentRef = adminDb
      .collection("appointments")
      .doc(appointmentId);
    const aptSnap = await appointmentRef.get();

    if (!aptSnap.exists) {
      console.warn("Appointment not found for payment webhook:", appointmentId);
      return res.status(200).send("OK");
    }

    const aptData = aptSnap.data();

    const studentId = aptData.studentId || null;

    /* ============================================================
       5 IDEMPOTENCY GUARD
    ============================================================ */

    if (aptData.paymentStatus === "success") {
      return res.status(200).send("OK");
    }

    /* ============================================================
       6️ HANDLE PAYMENT CAPTURED
    ============================================================ */
    if (event === "payment.captured") {
      //compute paid amount in rupees from Razorpay (paise → rupees)
      const paidAmountRupees = Number(payment.amount) / 100;

      //strict session price check (appointment.amount is rupees)
      if (aptData.amount && Number(aptData.amount) !== paidAmountRupees) {
        console.error(
          "Webhook amount mismatch. Expected:",
          aptData.amount,
          "got:",
          paidAmountRupees,
        );
        return res.status(200).send("PRICE_MISMATCH_IGNORED");
      }

      /* ------------------------------------------------------------
        7 UPDATE APPOINTMENT
      ------------------------------------------------------------ */

      await appointmentRef.update({
        //Appointment state
        status: "scheduled",
        paymentStatus: "success",

        //Top-level payment fields
        orderId: payment.order_id,
        paymentId: payment.id,
        signature: signature,

        //Canonical payment object
        paymentDetails: {
          orderId: payment.order_id,
          paymentId: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          method: payment.method || null,
          captured: true,
          createdAt: new Date(),
          raw: {
            paymentId: payment.id,
            orderId: payment.order_id,
            status: payment.status,
          },
        },

        paidAt: new Date(),
        updatedAt: new Date(),
      });

      /* ============================================================
         PAYMENTS MASTER 
      ============================================================ */

      await adminDb
        .collection("payments")
        .doc(payment.id)
        .set(
          {
            paymentId: payment.id,
            orderId: payment.order_id,
            appointmentId,
            counsellorId: aptData.counsellorId,
            userId: aptData.studentId || null,
            amountPaise: payment.amount,
            amountRupees: paidAmountRupees,
            currency: payment.currency,
            status: "success",
            method: payment.method || null,
            source: "razorpay-webhook",
            updatedAt: new Date(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

      await adminDb
        .collection("counsellors")
        .doc(aptData.counsellorId)
        .collection("appointments")
        .doc(appointmentId)
        .set(
          {
            paymentStatus: "success",
            status: "scheduled",
            updatedAt: new Date(),
          },
          { merge: true },
        );

      if (aptData.studentId) {
        await adminDb
          .collection("users")
          .doc(aptData.studentId)
          .collection("appointments")
          .doc(appointmentId)
          .set(
            {
              paymentStatus: "success",
              status: "scheduled",
              updatedAt: new Date(),
            },
            { merge: true },
          );
      }

      return res.status(200).send("OK");
    }

    /* ============================================================
       7️ HANDLE PAYMENT FAILED
    ============================================================ */

    if (event === "payment.failed") {
      //save failure info
      await appointmentRef.update({
        paymentStatus: "failed",
        "meta.status": "payment_failed",
        updatedAt: new Date(),
      });

      /* ============================================================
       8️ IGNORE ALL OTHER EVENTS
    ============================================================ */

      return res.status(200).send("OK");
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send("Server error");
  }
};
