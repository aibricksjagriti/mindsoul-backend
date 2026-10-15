import crypto from "crypto";
import { db as adminDb } from "../../config/firebase.js";
import admin from "firebase-admin";
import { razorpay } from "../../services/razorpayClient.js";

import { notifyPaidBooking } from "../../services/paidBookingMail.service.js";

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

export const razorpayWebhook = async (req, res) => {
  try {
    console.log("WEBHOOK HIT", {
      hasRawBody: !!req.rawBody,
      hasSignature: !!req.headers["x-razorpay-signature"],
    });

    /* ============================================================
      1  VERIFY WEBHOOK SIGNATURE (AUTHENTICITY CHECK)
    ============================================================ */

    const rawBody = req.rawBody;
    const signature = req.headers["x-razorpay-signature"];

    if (!rawBody) {
      console.error("Webhook ERROR: rawBody missing. Ensure express raw parser is setup.");
      return res.status(400).send("Bad Request");
    }

    if (!signature) {
      return res.status(400).send("No signature header");
    }
    if (!WEBHOOK_SECRET) return res.status(503).send("Webhook is not configured");

    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature) || !crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"))) {
      return res.status(400).send("Invalid signature");
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error("Invalid JSON in webhook");
      return res.status(400).send("Invalid payload");
    }

    /* ============================================================
      2 EXTRACT EVENT + PAYMENT ENTITY
    ============================================================ */
    const event = payload.event;
    const payment = payload.payload?.payment?.entity;
    if (!["payment.captured", "payment.authorized", "payment.failed"].includes(event)) return res.status(200).send("Ignored event");

    // Top-Level Event Logging for visibility
    console.log("WEBHOOK RECEIVED", {
      event,
      paymentId: payment?.id,
      orderId: payment?.order_id,
    });

    // If no payment object, ensure payment exists
    if (!payment) {
      return res.status(200).send("No payment entity");
    }

    /* ============================================================
      3  RESOLVE appointmentId FROM NOTES (Zero external API dependencies constraint)
    ============================================================ */
    const order = payment.order_id ? await razorpay.orders.fetch(payment.order_id) : null;
    const appointmentId = payment?.notes?.appointmentId || order?.notes?.appointmentId;

    //safety check
    if (!appointmentId) {
      console.warn("No appointmentId found in webhook (order.notes.appointmentId missing)");
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

    let aptData = aptSnap.data();
    const storedOrder = aptData.razorpayOrderId || aptData.orderId;
    if (aptData.bookingType === "complimentary" || !storedOrder || storedOrder !== payment.order_id || order?.notes?.appointmentId !== appointmentId ||
        !Number.isFinite(Number(aptData.amount)) || Number(aptData.amount) <= 0 || Math.round(Number(aptData.amount) * 100) !== payment.amount || order.amount !== payment.amount ||
        payment.currency !== "INR" || order.currency !== "INR") {
      console.error("Payment webhook appointment binding mismatch", { appointmentId });
      return res.status(400).send("Payment does not match appointment");
    }

    /* ============================================================
       5 IDEMPOTENCY GUARD
    ============================================================ */

    if (
      aptData.paymentStatus === "success" ||
      aptData.paymentDetails?.paymentId === payment.id
    ) {
      console.log("Webhook skipped (idempotent)", {
        appointmentId,
        paymentId: payment.id,
      });
      if ((aptData.paymentId || aptData.paymentDetails?.paymentId) !== payment.id) return res.status(409).send("Different payment already recorded");
      if (event !== "payment.captured" || payment.status !== "captured") return res.status(200).send("OK");
      if (aptData.fulfillmentComplete) {
        await notifyPaidBooking(appointmentId);
        return res.status(200).send("OK");
      }
    }

    /* ============================================================
       6️ HANDLE PAYMENT CAPTURED
    ============================================================ */
    if (event === "payment.captured") {
      if (payment.status !== "captured") return res.status(400).send("Payment is not captured");
      //compute paid amount in rupees from Razorpay (paise → rupees)
      const paidAmountRupees = Number(payment.amount) / 100;

      //strict session price check mapping float precision safely to paise 1->100
      if (aptData.amount && Math.round(Number(aptData.amount) * 100) !== payment.amount) {
        console.error(
          "Webhook amount mismatch. Expected (paise):",
          Math.round(Number(aptData.amount) * 100),
          "got (paise):",
          payment.amount
        );
        return res.status(200).send("PRICE_MISMATCH_IGNORED");
      }

      /* ------------------------------------------------------------
        7 UPDATE APPOINTMENT
      ------------------------------------------------------------ */

      await adminDb.runTransaction(async (batch) => {
      const fresh = await batch.get(appointmentRef);
      aptData = fresh.data();
      if (!aptData || (aptData.paymentStatus === "success" && (aptData.paymentId || aptData.paymentDetails?.paymentId) !== payment.id)) throw Object.assign(new Error("Payment state changed"), { statusCode: 409 });
      const matchingSlots = await batch.get(adminDb.collection("timeSlots").where("counsellorId", "==", aptData.counsellorId).where("date", "==", aptData.date).where("startTime", "==", aptData.timeSlot.split("-")[0].trim()));
      const slot = matchingSlots.docs.find(doc => doc.data().endTime === aptData.timeSlot.split("-")[1].trim());
      const slotData = slot?.data();
      const queuedEmails = await Promise.all(["user", "counsellor", "user_receipt", "counsellor_receipt"].map(kind => batch.get(adminDb.collection("bookingNotifications").doc(`${appointmentId}_${kind}`))));
      if ((aptData.razorpayOrderId || aptData.orderId) !== payment.order_id || Math.round(Number(aptData.amount) * 100) !== payment.amount) throw Object.assign(new Error("Payment binding changed"), { statusCode: 409 });
      if (!slot || (slotData.isBooked && (slotData.bookedAppointmentId ? slotData.bookedAppointmentId !== appointmentId : slotData.bookedBy !== aptData.studentId))) {
        console.error("Captured payment requires manual booking review", { appointmentId, paymentId: payment.id });
        throw Object.assign(new Error("Slot reservation no longer available"), { statusCode: 409 });
      }
      batch.update(slot.ref, { isBooked: true, bookedBy: aptData.studentId, bookedAppointmentId: appointmentId });
      for (const [index, kind] of ["user", "counsellor", "user_receipt", "counsellor_receipt"].entries()) if (!queuedEmails[index].exists) batch.set(adminDb.collection("bookingNotifications").doc(`${appointmentId}_${kind}`), { appointmentId, kind, status: "pending", attempts: 0 });
      batch.update(appointmentRef, {
        //Appointment state
        status: "scheduled",
        paymentStatus: "success",
        fulfillmentComplete: true,

        //clear expiry timing
        paymentExpiresAt: null,
        ttlDeleteAt: admin.firestore.FieldValue.delete(),

        //Top-level payment fields
        orderId: payment.order_id,
        paymentId: payment.id,
        webhookSignature: signature, // Indicates this arrived via webhook, not client verify payload

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

      console.log("Appointment updated via webhook", {
        appointmentId,
        paymentId: payment.id,
      });

      /* ============================================================
         PAYMENTS MASTER 
      ============================================================ */

      const counsellorProfile = aptData.counsellorProfileSnapshot || {};
      const webhookCounsellorName =
        `${counsellorProfile.firstName || ""} ${counsellorProfile.lastName || ""}`.trim() || null;

      batch.set(adminDb.collection("payments").doc(payment.id),
          {
            paymentId: payment.id,
            orderId: payment.order_id,
            appointmentId,
            counsellorId: aptData.counsellorId,
            counsellorName: webhookCounsellorName,
            userId: aptData.studentId || null,
            userEmail: aptData.studentEmail || null,
            userName: aptData.studentName || null,
            amountPaise: payment.amount,
            amountRupees: paidAmountRupees,
            currency: payment.currency,
            status: "success",
            method: payment.method || null,
            appointmentDate: aptData.date || null,
            timeSlot: aptData.timeSlot || null,
            source: "razorpay-webhook",
            updatedAt: new Date(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

      batch.set(adminDb.collection("counsellors").doc(aptData.counsellorId).collection("appointments").doc(appointmentId),
          {
            paymentStatus: "success",
            status: "scheduled",
            paymentExpiresAt: null,
            ttlDeleteAt: admin.firestore.FieldValue.delete(),
            updatedAt: new Date(),
          },
          { merge: true },
        );

      if (aptData.studentId) {
        batch.set(adminDb.collection("users").doc(aptData.studentId).collection("appointments").doc(appointmentId),
            {
              paymentStatus: "success",
              status: "scheduled",
              paymentExpiresAt: null,
              ttlDeleteAt: admin.firestore.FieldValue.delete(),
              updatedAt: new Date(),
            },
            { merge: true },
          );
      }

      });
      await notifyPaidBooking(appointmentId);

      return res.status(200).send("OK");
    }

    /* ============================================================
       7️ HANDLE PAYMENT AUTHORIZED (AUTO-CAPTURE FALLBACK)
    ============================================================ */

    if (event === "payment.authorized") {
      try {
        await razorpay.payments.capture(payment.id, payment.amount);
        console.log(`Payment ${payment.id} explicitly captured by webhook`);
      } catch (err) {
        const actual = await razorpay.payments.fetch(payment.id);
        if (actual.status !== "captured") throw err;
      }
      return res.status(200).send("OK");
    }

    /* ============================================================
       8️ HANDLE PAYMENT FAILED
    ============================================================ */

    if (event === "payment.failed") {
      //save failure info
      await adminDb.runTransaction(async transaction => {
        const fresh = await transaction.get(appointmentRef);
        if (!fresh.exists || fresh.data().paymentStatus === "success") return;
        transaction.update(appointmentRef, { paymentStatus: "failed", "meta.status": "payment_failed", updatedAt: new Date() });
      });

      /* ============================================================
       8️ IGNORE ALL OTHER EVENTS
    ============================================================ */

      return res.status(200).send("OK");
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(err.statusCode === 503 ? 503 : 500).send("Server error");
  }
};
