// src/utils/emailTemplates.js

export const getOtpEmailHtml = (otp, minutes = 5) => `

   <div style="background:#f3f0ff; padding:32px; font-family:Arial, sans-serif;">
    <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:14px; 
                box-shadow:0 5px 18px rgba(0,0,0,0.10); overflow:hidden;">

      <!-- Header -->
      <div style="background:#7A3CFF; padding:24px 32px;">
        <h2 style="margin:0; color:white; font-size:22px; font-weight:600;">
          MINDSOUL Verification
        </h2>
        <p style="margin:4px 0 0; color:#eaddff; font-size:14px;">
          Secure One-Time Password (OTP)
        </p>
      </div>

      <!-- Body -->
      <div style="padding:32px;">

        <p style="font-size:16px; color:#333;">
          Hello,
        </p>

        <p style="font-size:15px; color:#555; line-height:1.6;">
          Please use the verification code below to complete your login or authentication process.
        </p>

        <!-- OTP Box -->
        <div style="
            margin:28px 0;
            padding:18px 0;
            text-align:center;
            background:#f3ecff;
            border:1px solid #e4d7ff;
            border-radius:10px;">
          <span style="
              font-size:32px;
              font-weight:700;
              color:#7A3CFF;
              letter-spacing:3px;">
            ${otp}
          </span>
        </div>

        <p style="font-size:14px; color:#666;">
          This code is valid for <strong>${minutes} minutes</strong>.  
          For security reasons, do not share this code with anyone.
        </p>

        <!-- Divider -->
        <div style="margin:28px 0; border-top:1px solid #eee;"></div>

        <p style="font-size:13px; color:#888; line-height:1.5;">
          If you did not request this verification code, you can safely ignore this message 
          or <a href="#" style="color:#7A3CFF; text-decoration:none;">contact our support team</a>.
        </p>

        <p style="margin-top:28px; font-size:12px; color:#aaa;">
          © ${new Date().getFullYear()} MINDSOUL. All rights reserved.
        </p>

      </div>

    </div>
  </div>
`;
