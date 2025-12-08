export function userPaymentReceiptTemplate({
  studentName,
  paymentId,
  orderId,
  amount,
  date,
}) {
  return `
  <div style="font-family: Arial, sans-serif; background:#f7f5ff; padding:25px;">
    <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:10px; padding:30px; 
                box-shadow:0 4px 12px rgba(0,0,0,0.06);">

      <h2 style="color:#7A3CFF; margin-top:0;">Payment Successful</h2>

      <p style="font-size:15px; color:#333;">
        Hi <strong>${studentName || "User"}</strong>,
      </p>

      <p style="font-size:14px; color:#555;">
        Thank you for your payment. Here is your receipt for the recent transaction.
      </p>

      <table style="width:100%; margin-top:20px; border-collapse:collapse;">
        <tr>
          <td style="padding:10px; border-bottom:1px solid #eee; font-weight:bold;">Payment ID:</td>
          <td style="padding:10px; border-bottom:1px solid #eee;">${paymentId}</td>
        </tr>

        <tr>
          <td style="padding:10px; border-bottom:1px solid #eee; font-weight:bold;">Order ID:</td>
          <td style="padding:10px; border-bottom:1px solid #eee;">${orderId}</td>
        </tr>

        <tr>
          <td style="padding:10px; border-bottom:1px solid #eee; font-weight:bold;">Amount Paid:</td>
          <td style="padding:10px; border-bottom:1px solid #eee;">₹${amount}</td>
        </tr>

        <tr>
          <td style="padding:10px; font-weight:bold;">Date:</td>
          <td style="padding:10px;">${date}</td>
        </tr>
      </table>

      <div style="margin-top:25px; padding:15px; background:#f0e9ff; 
                  border-left:4px solid #7A3CFF; border-radius:5px;">
        <p style="margin:0; color:#333; font-size:14px;">
          This email serves as an official payment receipt from MINDSOUL.
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
