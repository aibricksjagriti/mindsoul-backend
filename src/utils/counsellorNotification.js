export function counsellorNotificationTemplate({
  counsellorName,
  studentName,
  date,
  time,
  startUrl,
}) {
  return `
    
  <div style="background:#f4f2ff; padding:30px; font-family:Arial, sans-serif;">
    <div style="max-width:620px; margin:auto; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,0.12);">

      <!-- Header -->
      <div style="background:#7A3CFF; padding:22px 30px;">
        <h1 style="color:white; margin:0; font-size:24px; font-weight:600;">
          New Appointment Scheduled
        </h1>
      </div>

      <!-- Body -->
      <div style="padding:30px;">

        <p style="font-size:16px; color:#333; margin-top:0;">
          Hi <strong>${counsellorName || "Counsellor"}</strong>,
        </p>

        <p style="font-size:15px; color:#555;">
          A new appointment has been booked with you.  
          Please review the session details below:
        </p>

        <!-- Appointment Card -->
        <div style="background:#faf9ff; border:1px solid #ece7ff; border-radius:12px; padding:20px; margin-top:20px;">
          <table style="width:100%; border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0; color:#555; font-weight:600;">Student</td>
              <td style="padding:10px 0; color:#333;">${studentName}</td>
            </tr>
            <tr>
              <td style="padding:10px 0; color:#555; font-weight:600;">Date</td>
              <td style="padding:10px 0; color:#333;">${date}</td>
            </tr>
            <tr>
              <td style="padding:10px 0; color:#555; font-weight:600;">Time</td>
              <td style="padding:10px 0; color:#333;">${time}</td>
            </tr>
            <tr>
              <td style="padding:10px 0; color:#555; font-weight:600;">Host Link</td>
              <td style="padding:10px 0;">
                <a href="${startUrl}" 
                   style="color:#7A3CFF; text-decoration:none; font-weight:bold;">
                  Start Meeting (Host)
                </a>
              </td>
            </tr>
          </table>
        </div>

        <!-- Tips Box (Different from User Template) -->
        <div style="margin-top:25px; background:#eae2ff; border-left:5px solid #7A3CFF; padding:15px 20px; border-radius:6px;">
          <p style="margin:0; color:#4c3c8a; font-size:14px;">
            Please be ready 10 minutes early and ensure your Zoom host account is logged in.
          </p>
        </div>

        <!-- Footer -->
        <p style="margin-top:30px; font-size:14px; color:#666;">
          Regards,<br/>
          <strong style="color:#7A3CFF;">MINDSOUL Team</strong>
        </p>

      </div>

      <!-- Bottom Bar -->
      <div style="background:#faf9ff; padding:15px; text-align:center; border-top:1px solid #eee;">
        <p style="margin:0; font-size:12px; color:#888;">
          © MINDSOUL · Empowering mental well-being
        </p>
      </div>

    </div>
  </div>
  `;
}
