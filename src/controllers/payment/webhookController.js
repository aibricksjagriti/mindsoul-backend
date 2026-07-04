import crypto from "crypto";
import { db as adminDb } from "../../config/firebase.js";
import admin from "firebase-admin";
import { razorpay } from "../../services/razorpayClient.js";

import { emailClient, sendEmail } from "../../services/emailService.js";
import { userPaymentReceiptTemplate } from "../../utils/userPaymentReceiptTemplate.js";
import { counsellorPaymentReceiptTemplate } from "../../utils/counsellorPaymentReceiptTemplate.js";
import { appointmentConfirmationTemplate } from "../../utils/appointmentConfirmation.js";
import { counsellorNotificationTemplate } from "../../utils/counsellorNotification.js";

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

    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) {
      console.error("Webhook signature mismatch", {
        expected,
        received: signature,
        bodyLength: rawBody?.length,
        hint: "Check RAW body / secret mismatch / middleware order",
      });
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
    const appointmentId = payment?.notes?.appointmentId;

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

    const aptData = aptSnap.data();

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
      return res.status(200).send("OK");
    }

    /* ============================================================
       6️ HANDLE PAYMENT CAPTURED
    ============================================================ */
    if (event === "payment.captured") {
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

      await appointmentRef.update({
        //Appointment state
        status: "scheduled",
        paymentStatus: "success",

        //clear expiry timing
        paymentExpiresAt: null,

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

      await adminDb
        .collection("payments")
        .doc(payment.id)
        .set(
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

      // SEND EMAILS (Fire and Forget)
      try {
        let studentName = aptData.studentName || null;
        if (!studentName && aptData.studentId) {
          const userSnap = await adminDb.collection("users").doc(aptData.studentId).get();
          if (userSnap.exists) {
            const u = userSnap.data();
            studentName = u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || null;
          }
        }
        
        const userNameForMail = studentName || aptData.studentEmail || "User";
        let counsellorName = webhookCounsellorName || "Counsellor";

        const emailPromises = [];

        // User appointment email
        if (aptData.studentEmail) {
          const userHtml = appointmentConfirmationTemplate({
            studentName: userNameForMail,
            counsellorName: counsellorName,
            date: aptData.date,
            timeSlot: aptData.timeSlot,
            zoomLink: aptData.zoomLink,
          });

          emailPromises.push(
            emailClient.sendMail({
              from: `MINDSOUL <${process.env.MAIL_USER}>`,
              to: aptData.studentEmail,
              subject: "Hello User, Your Counselling Appointment is Confirmed",
              html: userHtml,
            })
          );

          emailPromises.push(
            sendEmail({
              to: aptData.studentEmail,
              subject: "Payment Receipt – MINDSOUL",
              html: userPaymentReceiptTemplate({
                studentName: userNameForMail,
                paymentId: payment.id,
                orderId: payment.order_id,
                amount: paidAmountRupees.toFixed(2),
                date: new Date().toLocaleString(),
              }),
            })
          );
        }

        // Counsellor appointment email
        let counsellorEmail = aptData.counsellorEmail || null;
        if (!counsellorEmail && aptData.counsellorId) {
          const cSnap = await adminDb.collection("counsellors").doc(aptData.counsellorId).get();
          if (cSnap.exists) {
            counsellorEmail = cSnap.data()?.email || null;
            if (!counsellorName || counsellorName === "Counsellor") {
                const c = cSnap.data();
                counsellorName = `${c.profileData?.firstName || ""} ${c.profileData?.lastName || ""}`.trim() || "Counsellor";
            }
          }
        }

        if (counsellorEmail) {
          const counsellorHtml = counsellorNotificationTemplate({
            counsellorName: counsellorName,
            studentName: userNameForMail,
            studentEmail: aptData.studentEmail,
            date: aptData.date,
            timeSlot: aptData.timeSlot,
            startUrl: aptData.zoomLink,
          });

          emailPromises.push(
            emailClient.sendMail({
              from: `MINDSOUL <${process.env.MAIL_USER}>`,
              to: counsellorEmail,
              subject: "Hello Counsellor, You have a new appointment",
              html: counsellorHtml,
            })
          );

          emailPromises.push(
            sendEmail({
              to: counsellorEmail,
              subject: "Payment Processed – MINDSOUL",
              html: counsellorPaymentReceiptTemplate({
                counsellorName: counsellorName,
                studentName: userNameForMail,
                paymentId: payment.id,
                orderId: payment.order_id,
                amount: paidAmountRupees.toFixed(2),
                date: new Date().toLocaleString(),
              }),
            })
          );
        }

        // Execute background emails completely unbound from the thread safely catching rejections
        Promise.allSettled(emailPromises).then((results) => {
          results.forEach((r, i) => {
            if (r.status === "rejected") {
              console.error(`Email promise ${i} failed:`, r.reason);
            }
          });
        });
      } catch (emailErr) {
        console.error("Webhook Email sending configuration failed:", emailErr);
      }

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
        if (err.error?.code !== "BAD_REQUEST_ERROR") {
          console.error("Failed to explicit capture payment in webhook:", err, payment.id);
        }
      }
      return res.status(200).send("OK");
    }

    /* ============================================================
       8️ HANDLE PAYMENT FAILED
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
