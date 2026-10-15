import nodemailer from "nodemailer";
import { db } from "../config/firebase.js";
import { createComplimentaryNotifications } from "./complimentaryNotifications.service.js";

const notify = createComplimentaryNotifications({
  db, frontendUrl: process.env.FRONTEND_URL || "https://www.themindsoul.com",
  sendMail: async (message) => {
    const transport = nodemailer.createTransport({
      service: "gmail", connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    });
    try { return await transport.sendMail({ ...message, from: { name: "MindSoul", address: process.env.MAIL_USER } }); }
    finally { transport.close(); }
  },
});

export const notifyComplimentaryBooking = async (id) => {
  try { return await notify(id); }
  catch { console.error("Complimentary confirmation requires retry", { appointmentId: id }); return { user: "retry_required", counsellor: "retry_required" }; }
};
