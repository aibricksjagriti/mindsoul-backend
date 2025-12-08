export function counsellorPaymentReceiptTemplate({
  counsellorName,
  studentName,
  paymentId,
  orderId,
  amount,
  date,
}) {
  return `
  <div style="background:#f4f2ff; padding:30px; font-family:Arial, sans-serif;">
    <div style="max-width:620px; margin:auto; background:#ffffff; border-radius:14px; 
                overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,0.12);">

      <div style="background:#7A3CFF; padding:22px 30px;">
        <h1 style="color:white; margin:0; font-size:22px; font-weight:600;">
          Payment Confirmation
        </h1>
      </div>

      <div style="padding:30px;">
        <p style="font-size:15px; color:#333;">
          Hi <strong>${counsellorName || "Counsellor"}</strong>,
        </p>

        <p style="font-size:14px; color:#555; margin-top:0;">
          A session has been booked and the payment has been successfully processed.
          Here are the payment details for your reference.
        </p>

        <div style="background:#faf9ff; border:1px solid #ece7ff; 
                    border-radius:12px; padding:20px; margin-top:20px;">
          <table style="width:100%; border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0; color:#555; font-weight:600;">Student</td>
              <td style="padding:10px 0; color:#333;">${studentName}</td>
            </tr>

            <tr>
              <td style="padding:10px 0; color:#555; font-weight:600;">Payment ID</td>
              <td style="padding:10px 0; color:#333;">${paymentId}</td>
            </tr>

            <tr>
              <td style="padding:10px 0; color:#555; font-weight:600;">Order ID</td>
              <td style="padding:10px 0; color:#333;">${orderId}</td>
            </tr>

            <tr>
              <td style="padding:10px 0; color:#555; font-weight:600;">Amount</td>
              <td style="padding:10px 0; color:#333;">₹${amount}</td>
            </tr>

            <tr>
              <td style="padding:10px 0; color:#555; font-weight:600;">Date</td>
              <td style="padding:10px 0; color:#333;">${date}</td>
            </tr>
          </table>
        </div>

        <p style="margin-top:25px; font-size:14px; color:#666;">
          Regards, <br/>
          <strong style="color:#7A3CFF;">MINDSOUL Team</strong>
        </p>
      </div>

      <div style="background:#faf9ff; padding:15px; text-align:center; border-top:1px solid #eee;">
        <p style="margin:0; font-size:12px; color:#888;">
          © MINDSOUL · Empowering mental well-being
        </p>
      </div>

    </div>
  </div>
  `;
}
