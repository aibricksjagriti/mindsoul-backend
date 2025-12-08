import nodemailer from "nodemailer";

export const emailClient = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

export const sendEmail = async ({ to, subject, html }) => {
  try {
    await emailClient.sendMail({
      from: `"MINDSOUL" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html,
    });

    return true;
  } catch (error) {
    console.error("Email Error:", error);
    return false;
  }
};