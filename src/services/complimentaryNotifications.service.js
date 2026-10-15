import { randomUUID } from "node:crypto";
import { escapeHtml } from "../utils/escapeHtml.js";

// Shared delivery tracking; SMTP and payment state changes remain separate.
export const createBookingNotifications = ({ db, sendMail, frontendUrl, bookingType = "complimentary", now = () => Date.now() }) => {
  const base = new URL(frontendUrl);
  if (!["https:", "http:"].includes(base.protocol)) throw new Error("Invalid frontend URL");
  return async (appointmentId) => {
    const snapshot = await db.collection("appointments").doc(appointmentId).get();
    const booking = snapshot.data();
    const isFree = bookingType === "complimentary";
    if (!snapshot.exists || (isFree ? booking.bookingType !== "complimentary" : booking.bookingType === "complimentary" || booking.paymentStatus !== "success") || booking.status !== "scheduled") {
      throw Object.assign(new Error("Confirmed appointment required"), { statusCode: 409 });
    }
    const counsellor = await db.collection("counsellors").doc(booking.counsellorId).get();
    const user = await db.collection("users").doc(booking.studentId).get();
    const recipients = {
      user: user.data()?.email || booking.studentEmail,
      counsellor: counsellor.data()?.email,
    };
    const results = {};
    await Promise.all((isFree ? ["user", "counsellor"] : ["user", "counsellor", "user_receipt", "counsellor_receipt"]).map(async kind => {
      const role = kind.startsWith("user") ? "user" : "counsellor";
      const receipt = kind.endsWith("_receipt");
      const ref = db.collection(isFree ? "complimentaryNotifications" : "bookingNotifications").doc(`${appointmentId}_${kind}`);
      const attemptId = randomUUID();
      const claim = await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        if (current?.status === "sent") return "sent";
        if (current?.status === "sending" && current.leaseUntil > now()) return "sending";
        tx.set(ref, { appointmentId, role, kind, status: "sending", attemptId, leaseUntil: now() + 120000, attempts: (current?.attempts || 0) + 1 });
        return "claimed";
      });
      if (claim !== "claimed") { results[kind] = claim; return; }
      let status = "failed";
      try {
        if (!recipients[role]) throw new Error("Recipient missing");
        const url = role === "user" ? booking.zoomLink : new URL("/counsellor-dashboard", base).href;
        if (!receipt && (!url || new URL(url).protocol !== "https:")) throw new Error("Session link missing or invalid");
        const join = receipt ? null : new URL(booking.zoomLink);
        if (join && (join.protocol !== "https:" || !(join.hostname === "zoom.us" || join.hostname.endsWith(".zoom.us")))) throw new Error("Invalid Zoom join link");
        const counsellorJoinText = role === "counsellor" && !receipt ? `\nZoom join link: ${join.href}\nUse your dashboard to retrieve the secure host link.` : "";
        const action = role === "user" ? "Join your Zoom session" : "Open your dashboard to start the session";
        const paymentText = isFree ? "No payment is required." : `Payment received: INR ${Number(booking.amount).toFixed(2)}. Payment ID: ${booking.paymentId || booking.paymentDetails?.paymentId || ""}. Order ID: ${booking.orderId || booking.paymentDetails?.orderId || ""}.`;
        const introduction = receipt ? "MindSoul payment receipt" : `Your ${isFree ? "complimentary " : ""}MindSoul appointment is confirmed.`;
        const text = `${introduction}\nDate: ${booking.date}\nTime: ${booking.timeSlot} IST\n${paymentText}${receipt ? "" : `\n${action}: ${url}`}${counsellorJoinText}`;
        const info = await sendMail({
          to: recipients[role], subject: receipt ? "Payment receipt - MindSoul" : "Your MindSoul appointment is confirmed",
          messageId: `<${appointmentId}.${kind}@notifications.themindsoul.com>`,
          text, html: `<p>${introduction}</p><p>Date: ${escapeHtml(booking.date)}<br>Time: ${escapeHtml(booking.timeSlot)} IST</p><p>${escapeHtml(paymentText)}</p>${receipt ? "" : `<p><a href="${escapeHtml(url)}">${action}</a></p>`}${role === "counsellor" && !receipt ? `<p><a href="${escapeHtml(join.href)}">Zoom join link (participant)</a><br>Use your dashboard to retrieve the secure host link.</p>` : ""}`,
        });
        if (!info?.accepted?.length || info.rejected?.length) throw new Error("SMTP did not accept recipient");
        status = "sent";
      } catch {
        // No recipient addresses, tokens, or SMTP credentials in logs/records.
        console.error("Booking email was not accepted by SMTP", { appointmentId, kind });
      }
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        if (current?.attemptId === attemptId) tx.update(ref, { status: status === "failed" && current.attempts >= 5 ? "needs_attention" : status, leaseUntil: 0, updatedAt: now(), nextAttemptAt: status === "failed" ? now() + Math.min(3600000, 60000 * 2 ** Math.min(current.attempts, 6)) : 0 });
      });
      results[kind] = status;
    }));
    return results;
  };
};

export const createComplimentaryNotifications = options => createBookingNotifications({ ...options, bookingType: "complimentary" });
