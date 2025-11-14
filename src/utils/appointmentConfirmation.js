export function appointmentConfirmationTemplate({
  studentName,
  counsellorName,
  date,
  time,
  zoomLink,
}) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Your Appointment is Confirmed</h2>

      <p>Hi ${studentName || "User"},</p>

      <p>Your counselling session has been successfully scheduled.</p>

      <p><strong>Counsellor:</strong> ${counsellorName || "Your counsellor"}<br/>
      <strong>Date:</strong> ${date}<br/>
      <strong>Time:</strong> ${time}</p>

      <p><strong>Join the Zoom Meeting:</strong></p>
      <p><a href="${zoomLink}" style="color:#4C6EF5;">${zoomLink}</a></p>

      <br/>
      <p>Regards,<br/>MINDSOUL Team</p>
    </div>
  `;
}
