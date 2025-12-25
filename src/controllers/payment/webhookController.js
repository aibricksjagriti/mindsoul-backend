import crypto from "crypto";
import { db as adminDb } from "../../config/firebase.js";

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

export const razorpayWebhook = async (req, res) => {
  try {
    // 1. Verify webhook signature (AUTHENTICITY CHECK)

    const payload = req.rawBody || req.body;
    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).send("No signature header");
    }

    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest("hex");

    if (expected !== signature) {
      console.error("Webhook signature mismatch");
      return res.status(400).send("Invalid signature");
    }

    //  2. Extract event & payment entity
    const event = payload.event;
    const payment = payload.payload?.payment?.entity;

    // If no payment object,ensure payment exists
    if (!payment) {
      return res.status(200).send("No payment entity");
    }

    //3. Resolve appointmentId from Razorpay order.receipt(receipt format enforced during order creation)
    // extract appointmentId by fetching the Razorpay order
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

    // 4. Fetch appointment (single source of truth)
    const appointmentRef = adminDb
      .collection("appointments")
      .doc(appointmentId);
    const aptSnap = await appointmentRef.get();

    if (!aptSnap.exists) {
      console.warn("Appointment not found for payment webhook:", appointmentId);
      return res.status(200).send("OK");
    }

    const aptData = aptSnap.data();

    // 5. Idempotency guard If already marked success → do nothing
    if (aptData.paymentStatus === "success") {
      return res.status(200).send("OK");
    }

    // 6. Handle PAYMENT CAPTURED event
    if (event === "payment.captured") {
      // new   compute paid amount in rupees from Razorpay (paise → rupees)
      const paidAmountRupees = Number(payment.amount) / 100;

      // new   strict session price check (appointment.amount is rupees)
      if (aptData.amount && Number(aptData.amount) !== paidAmountRupees) {
        console.error(
          "Webhook amount mismatch. Expected:",
          aptData.amount,
          "got:",
          paidAmountRupees
        );
        return res.status(200).send("PRICE_MISMATCH_IGNORED");
      }

      //6.1 Update appointment
      await appointmentRef.update({
        paymentStatus: "success",
        "meta.status": "confirmed",
        paidAt: new Date(),
        updatedAt: new Date(),
        paymentDetails: {
          orderId: payment.order_id,
          paymentId: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          method: payment.method || null,
          captured: payment.captured || false,
          signature: signature,
          createdAt: new Date(),
          razorpayMeta: {
            paymentId: payment.id,
            orderId: payment.order_id,
            status: payment.status,
          },
        },
      });

      await appointmentRef.update({
        paymentStatus: "success",
        paymentDetails,
        "meta.status": "confirmed",
        paidAt: new Date(),
        updatedAt: new Date(),
      });

      //  6.2 Payments master collection (UPSERT) Ensures payment history parity

      await adminDb
        .collection("payments")
        .doc(payment.id)
        .set(
          {
            paymentId: payment.id,
            orderId: payment.order_id,
            appointmentId,
            counsellorId: aptData.counsellorId,
            userId: aptData.studentUid || null,
            amountPaise: payment.amount,
            amountRupees: paidAmountRupees,
            currency: payment.currency,
            status: "success",
            method: payment.method || null,
            source: "razorpay-webhook",
            updatedAt: new Date(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

      //  6.3 Subcollection sync (dashboard parity)

      await adminDb
        .collection("counsellors")
        .doc(aptData.counsellorId)
        .collection("appointments")
        .doc(appointmentId)
        .set({ paymentStatus: "success" }, { merge: true });

      if (aptData.studentUid) {
        await adminDb
          .collection("users")
          .doc(aptData.studentUid)
          .collection("appointments")
          .doc(appointmentId)
          .set({ paymentStatus: "success" }, { merge: true });
      }

      return res.status(200).send("OK");
    }

    // 7. Handle PAYMENT FAILED event

    if (event === "payment.failed") {
      // new   save failure info
      await appointmentRef.update({
        paymentStatus: "failed",
        "meta.status": "payment_failed",
        updatedAt: new Date(),
      });

      //8. Ignore all other events safely

      return res.status(200).send("OK");
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send("Server error");
  }
};
