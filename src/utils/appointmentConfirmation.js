export function appointmentConfirmationTemplate({
  studentName,
  counsellorName,
  date,
  time,
  zoomLink,
}) {
  return `
    
  <div style="font-family: Arial, sans-serif; background:#f7f5ff; padding:25px;">
    <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:10px; padding:30px; box-shadow:0 4px 12px rgba(0,0,0,0.06);">

      <h2 style="color:#7A3CFF; margin-top:0;">Appointment Confirmed</h2>

      <p style="font-size:15px; color:#333;">
        Hi <strong>${studentName || "User"}</strong>,
      </p>

      <p style="font-size:15px; color:#555;">
        Thank you for booking a session with <strong>MINDSOUL</strong>.  
        Below are the details of your upcoming appointment:
      </p>

      <table style="width:100%; margin-top:20px; border-collapse:collapse;">
        <tr>
          <td style="padding:10px; border-bottom:1px solid #eee; font-weight:bold;">Counsellor:</td>
          <td style="padding:10px; border-bottom:1px solid #eee;">${counsellorName}</td>
        </tr>
        <tr>
          <td style="padding:10px; border-bottom:1px solid #eee; font-weight:bold;">Date:</td>
          <td style="padding:10px; border-bottom:1px solid #eee;">${date}</td>
        </tr>
        <tr>
          <td style="padding:10px; border-bottom:1px solid #eee; font-weight:bold;">Time:</td>
          <td style="padding:10px; border-bottom:1px solid #eee;">${time}</td>
        </tr>
        <tr>
          <td style="padding:10px; font-weight:bold;">Zoom Meeting Link:</td>
          <td style="padding:10px;">
            <a href="${zoomLink}" style="color:#7A3CFF; text-decoration:none; font-weight:bold;">Join Meeting</a>
          </td>
        </tr>
      </table>

      <div style="margin-top:25px; padding:15px; background:#f0e9ff; border-left:4px solid #7A3CFF; border-radius:5px;">
        <p style="margin:0; color:#333; font-size:14px;">
          Please join the meeting 5 minutes early and ensure you are in a quiet environment.
        </p>
      </div>

      <p style="margin-top:25px; font-size:14px; color:#666;">
        Regards, <br/>
        <strong>MindSoul Team</strong>
      </p>

    </div>
  </div>
  
  `;
}
