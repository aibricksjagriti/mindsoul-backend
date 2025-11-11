// src/utils/emailTemplates.js

export const getOtpEmailHtml = (otp, minutes = 5) => `
  <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; padding: 40px; background-color: #f4f6f8; color: #2c3e50;">
  <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); padding: 30px;">
    <h2 style="color: #4B0082; font-size: 24px; margin-bottom: 20px;">🔐 MINDSOUL Secure Verification</h2>
    
    <p style="font-size: 16px; line-height: 1.6;">
      Hello Counsellor,<br><br>
      To proceed with your login or verification, please use the one-time password (OTP) below:
    </p>

    <div style="font-size: 32px; font-weight: 600; color: #2E8B57; text-align: center; letter-spacing: 2px; margin: 20px 0;">
      ${otp}
    </div>

    <p style="font-size: 15px; color: #555; line-height: 1.5;">
      This code is valid for <strong>${minutes} minutes</strong>. For your security, please do not share this code with anyone.
    </p>

    <div style="margin: 30px 0; border-top: 1px solid #e0e0e0;"></div>

    <p style="font-size: 13px; color: #999;">
      If you did not request this code, please disregard this message or <a href="#" style="color: #4B0082; text-decoration: none;">contact our support team</a>.
    </p>

    <p style="font-size: 12px; color: #ccc; margin-top: 20px;">
      © 2025 MINDSOUL Technologies. All rights reserved.
    </p>
  </div>
</div>
`;
