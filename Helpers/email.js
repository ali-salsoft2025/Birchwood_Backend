require("../config/loadEnv");
const nodemailer = require("nodemailer");
const {
  PASSWORD_RESET_SUBJECT,
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailText,
} = require("./emailTemplates");

const port = Number(process.env.MAIL_PORT) || 587;
const encryption = String(process.env.MAIL_ENCRYPTION || "tls").toLowerCase();
const secure = encryption === "ssl" || port === 465;

const smtpConfig = {
  host: process.env.MAIL_HOST,
  port,
  secure,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: process.env.MAIL_TLS_REJECT_UNAUTHORIZED !== "false",
  },
};

function getFromAddress() {
  const address =
    process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME || "";
  const name = process.env.MAIL_FROM_NAME || "Birchwood Academy";
  return `"${name}" <${address}>`;
}

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(smtpConfig);
  }
  return transporter;
}

async function sendPasswordResetEmail(email, code) {
  const html = buildPasswordResetEmailHtml({ code, email });
  const text = buildPasswordResetEmailText({ code, email });
  return generateEmail(email, PASSWORD_RESET_SUBJECT, html, text);
}

async function generateEmail(email, subject, html, text) {
  try {
    if (!process.env.MAIL_HOST || !process.env.MAIL_USERNAME) {
      console.log(
        "err in generate email: MAIL_HOST / MAIL_USERNAME not configured",
      );
      return false;
    }

    const mailOptions = {
      from: getFromAddress(),
      to: email,
      subject,
      text:
        text ||
        html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      html,
    };

    const info = await getTransporter().sendMail(mailOptions);
    console.log("email sent:", info.messageId);
    return true;
  } catch (err) {
    console.log("err in generate email: ", err);
    return false;
  }
}

module.exports = {
  PASSWORD_RESET_SUBJECT,
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailText,
  sendPasswordResetEmail,
  generateEmail,
};
