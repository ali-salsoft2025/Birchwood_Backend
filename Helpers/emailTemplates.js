const PASSWORD_RESET_SUBJECT = "Reset your Birchwood Academy password";
const PASSWORD_RESET_EXPIRES_MINUTES = 30;

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPasswordResetEmailHtml({
  code,
  email = "",
  expiresMinutes = PASSWORD_RESET_EXPIRES_MINUTES,
}) {
  const safeCode = escapeHtml(code);
  const safeEmail = escapeHtml(email);
  const year = new Date().getFullYear();
  const supportEmail =
    process.env.MAIL_FROM_ADDRESS ||
    process.env.MAIL_USERNAME ||
    "support@thebirchwoodacademy.com";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${PASSWORD_RESET_SUBJECT}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#eef3ff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#eef3ff;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,51,197,0.12);">
            <tr>
              <td style="background:linear-gradient(135deg,#0033c5 0%,#1d5cff 100%);padding:28px 32px;">
                <p style="margin:0;color:#ffffff;font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.9;">
                  Birchwood Montessori Academy
                </p>
                <h1 style="margin:10px 0 0;color:#ffffff;font-size:26px;line-height:1.3;font-weight:700;">
                  Password Reset
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
                  Hello${safeEmail ? ` <strong>${safeEmail}</strong>` : ""},
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4b5563;">
                  We received a request to reset the password for your Birchwood Academy account.
                  Use the verification code below in the app to continue.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="background-color:#f5f8ff;border:1px solid #d7e3ff;border-radius:12px;padding:24px 16px;">
                      <p style="margin:0 0 8px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#0033c5;font-weight:700;">
                        Your verification code
                      </p>
                      <p style="margin:0;font-size:36px;line-height:1;letter-spacing:10px;font-weight:700;color:#0033c5;">
                        ${safeCode}
                      </p>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#4b5563;">
                  This code expires in <strong>${expiresMinutes} minutes</strong>.
                  If you did not request a password reset, you can safely ignore this email and your password will stay the same.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
                  Need help? Contact us at
                  <a href="mailto:${supportEmail}" style="color:#0033c5;text-decoration:none;">${supportEmail}</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f8fafc;padding:18px 32px;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;text-align:center;">
                  &copy; ${year} Birchwood Montessori Academy. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildPasswordResetEmailText({
  code,
  email = "",
  expiresMinutes = PASSWORD_RESET_EXPIRES_MINUTES,
}) {
  const supportEmail =
    process.env.MAIL_FROM_ADDRESS ||
    process.env.MAIL_USERNAME ||
    "support@thebirchwoodacademy.com";

  return [
    "Birchwood Montessori Academy",
    "Password Reset",
    "",
    email ? `Hello ${email},` : "Hello,",
    "",
    "We received a request to reset the password for your Birchwood Academy account.",
    "Use the verification code below in the app to continue.",
    "",
    `Verification code: ${code}`,
    "",
    `This code expires in ${expiresMinutes} minutes.`,
    "If you did not request a password reset, you can safely ignore this email.",
    "",
    `Need help? Contact ${supportEmail}`,
  ].join("\n");
}

module.exports = {
  PASSWORD_RESET_SUBJECT,
  PASSWORD_RESET_EXPIRES_MINUTES,
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailText,
};
