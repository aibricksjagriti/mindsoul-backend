// src/utils/emailTemplates.js

export const getOtpEmailHtml = (otp, minutes = 5) => `
  <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9;">
    <h1 style="color: #4B0082;">MINDSOUL Verification Code</h1>
    <p style="font-size: 16px; color: #333;">
      Hello Counsellor,<br><br>
      Your one-time password (OTP) for verification is:
    </p>
    <div style="font-size: 24px; font-weight: bold; color: #2E8B57; margin: 10px 0;">
      ${otp}
    </div>
    <p style="font-size: 14px; color: #555;">
      This code will expire in <strong>${minutes} minutes</strong>. Please do not share this code with anyone.
    </p>
    <hr style="margin: 20px 0;">
    <p style="font-size: 12px; color: #999;">
      If you did not request this code, please ignore this email or contact support.
    </p>
  </div>
`;
