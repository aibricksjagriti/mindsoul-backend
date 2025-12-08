import crypto from "crypto";
import { db as adminDb } from "../../config/firebase.js";

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

export const razorpayWebhook = async (req, res) => {
  try {
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

    const event = payload.event;
    const payment = payload.payload?.payment?.entity;

    // new   ensure payment exists
    if (!payment) {
      return res.status(200).send("No payment entity");
    }

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

    // new   get appointment ref
    const appointmentRef = adminDb
      .collection("appointments")
      .doc(appointmentId);
    const aptSnap = await appointmentRef.get();

    if (!aptSnap.exists) {
      console.warn("Appointment not found for payment webhook:", appointmentId);
      return res.status(200).send("OK");
    }

    const aptData = aptSnap.data();

    // new   ignore if already marked success
    if (aptData.paymentStatus === "success") {
      return res.status(200).send("OK");
    }

    // -------------------------------
    // HANDLE PAYMENT CAPTURED EVENT
    // -------------------------------
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

      // new   update appointment with payment details
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
          raw: payment,
        },
      });

      return res.status(200).send("OK");
    }

    // -------------------------------
    // HANDLE PAYMENT FAILURE EVENT
    // -------------------------------
    if (event === "payment.failed") {
      // new   save failure info
      await appointmentRef.update({
        paymentStatus: "failed",
        "meta.status": "payment_failed",
        updatedAt: new Date(),
      });

      return res.status(200).send("OK");
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send("Server error");
  }
};
