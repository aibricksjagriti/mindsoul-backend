export function counsellorNotificationTemplate({
  counsellorName,
  studentName,
  date,
  time,
  startUrl,
}) {
  return `
    <div style="font-family: Arial, sans-serif; line-height:1.5;">
      <h2>New Appointment Scheduled</h2>
      <p>Hi ${counsellorName || "Counsellor"},</p>
      <p>An appointment has been booked with you.</p>
      <p><strong>Student:</strong> ${studentName || "Student"}<br/>
         <strong>Date:</strong> ${date}<br/>
         <strong>Time:</strong> ${time}</p>
      <p><strong>Start the meeting (host):</strong></p>
      <p><a href="${startUrl}" style="color:#4C6EF5;">Start Meeting</a></p>
      <br/>
      <p>Regards,<br/>MINDSOUL Team</p>
    </div>
  `;
}
