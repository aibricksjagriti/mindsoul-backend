import nodemailer from "nodemailer";
import { db } from "../config/firebase.js";
import { createBookingNotifications } from "./complimentaryNotifications.service.js";

const notify = createBookingNotifications({
  db, bookingType: "paid", frontendUrl: process.env.FRONTEND_URL || "https://www.themindsoul.com",
  sendMail: async message => {
    const transport = nodemailer.createTransport({
      service: "gmail", connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    });
    try { return await transport.sendMail({ ...message, from: { name: "MindSoul", address: process.env.MAIL_USER } }); }
    finally { transport.close(); }
  },
});

export const notifyPaidBooking = async id => {
  const result = await notify(id);
  if (Object.values(result).some(status => status !== "sent")) {
    throw Object.assign(new Error("Booking email delivery is pending retry"), { statusCode: 503 });
  }
  return result;
};
