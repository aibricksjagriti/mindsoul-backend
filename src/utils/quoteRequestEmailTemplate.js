export const quoteRequestEmailTemplate = (data) => {
  return `
  
  
  <div style="background:#f4f0ff; padding:40px 0; width:100%; font-family:'Segoe UI', Roboto, Arial, sans-serif;">
    <div style="
      max-width:620px;
      margin:0 auto;
      background:#ffffff;
      border-radius:20px;
      overflow:hidden;
      box-shadow:0 4px 14px rgba(0,0,0,0.08);
    ">

      <!-- Header -->
      <div style="background:#7B2FF7; padding:36px 32px; text-align:left;">
        <div style="font-size:26px; color:#ffffff; font-weight:700; letter-spacing:0.3px;">
          New Quote Request
        </div>
        <div style="font-size:15px; color:#e4d7ff; margin-top:6px;">
          MindSoul – Pricing & Inquiry Notification
        </div>
      </div>

      <!-- Body -->
      <div style="padding:36px 32px;">
        <p style="font-size:16px; color:#2d2d2d; margin:0 0 20px; line-height:1.5;">
          A new quote inquiry has been submitted via the MindSoul website.
        </p>

        <!-- Details Block -->
        <div style="
          background:#f7f2ff;
          padding:24px 22px;
          border-radius:14px;
          margin-top:16px;
        ">
          <div style="font-size:16px; color:#642dd1; font-weight:600; margin-bottom:16px;">
            Submitted Information
          </div>

          <!-- TABLE -->
          <table style="width:100%; font-size:15px; color:#444; border-collapse:separate; border-spacing:0;">
            
            <tr>
              <td style="
                background:#faf7ff;
                padding:12px 14px;
                border-bottom:1px solid #e6e0f5;
                font-weight:600;
                width:160px;">
                Full Name:
              </td>
              <td style="padding:12px 14px; border-bottom:1px solid #e6e0f5;">
                ${data.firstName} ${data.lastName}
              </td>
            </tr>

            <tr>
              <td style="
                background:#faf7ff;
                padding:12px 14px;
                border-bottom:1px solid #e6e0f5;
                font-weight:600;">
                Email:
              </td>
              <td style="padding:12px 14px; border-bottom:1px solid #e6e0f5;">
                ${data.email}
              </td>
            </tr>

            <tr>
              <td style="
                background:#faf7ff;
                padding:12px 14px;
                border-bottom:1px solid #e6e0f5;
                font-weight:600;">
                Phone:
              </td>
              <td style="padding:12px 14px; border-bottom:1px solid #e6e0f5;">
                ${data.phone}
              </td>
            </tr>

            <tr>
              <td style="
                background:#faf7ff;
                padding:12px 14px;
                border-bottom:1px solid #e6e0f5;
                font-weight:600;">
                Company:
              </td>
              <td style="padding:12px 14px; border-bottom:1px solid #e6e0f5;">
                ${data.company || "Not provided"}
              </td>
            </tr>

            <tr>
              <td style="
                background:#faf7ff;
                padding:12px 14px;
                border-bottom:1px solid #e6e0f5;
                font-weight:600;">
                Job Title:
              </td>
              <td style="padding:12px 14px; border-bottom:1px solid #e6e0f5;">
                ${data.jobTitle || "Not provided"}
              </td>
            </tr>

            <tr>
              <td style="
                background:#faf7ff;
                padding:12px 14px;
                border-bottom:1px solid #e6e0f5;
                font-weight:600;">
                Country:
              </td>
              <td style="padding:12px 14px; border-bottom:1px solid #e6e0f5;">
                ${data.country}
              </td>
            </tr>

            <tr>
              <td style="
                background:#faf7ff;
                padding:12px 14px;
                border-bottom:1px solid #e6e0f5;
                font-weight:600;">
                Employees:
              </td>
              <td style="padding:12px 14px; border-bottom:1px solid #e6e0f5;">
                ${data.employees}
              </td>
            </tr>

            <tr>
              <td style="
                background:#faf7ff;
                padding:12px 14px;
                font-weight:600;">
                Opt-in Allowed:
              </td>
              <td style="padding:12px 14px;">
                ${data.allowCommunication ? "Yes" : "No"}
              </td>
            </tr>

          </table>
        </div>

        <p style="margin-top:26px; font-size:14px; color:#666; line-height:1.5;">
          This is an automated notification triggered by a quote request submission.
          Kindly review the information and follow up with the user as required.
        </p>

      </div>
    </div>
  </div>

  `;
};
