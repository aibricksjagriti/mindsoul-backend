import transporter from "../config/nodemailerConfig.js";
import { quoteRequestEmailTemplate } from "../utils/quoteRequestEmailTemplate.js";

const OWNER_EMAIL=process.env.MINDSOUL_OWNER_EMAIL

export const sendQuoteRequestEmail = async (data) => {
  const mailOptions = {
    from: `"MindSoul Notifications" <no-reply@mindsoul.com>`,
    to: OWNER_EMAIL,
    subject: `New Custom Quote Request – ${data.firstName} ${data.lastName}`,
    html: quoteRequestEmailTemplate(data)
  };

    await transporter.sendMail(mailOptions);

}