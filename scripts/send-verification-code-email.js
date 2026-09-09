/**
 * Send a password-reset verification code email using app SMTP config.
 *
 *   node scripts/send-verification-code-email.js ali.talha3357@gmail.com
 */
require("../config/loadEnv");

const { generateString } = require("../Helpers/index");
const { sendPasswordResetEmail } = require("../Helpers/email");

const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/send-verification-code-email.js <email>");
  process.exit(1);
}

(async () => {
  const verificationCode = generateString(4, false, true);
  const sent = await sendPasswordResetEmail(email, verificationCode);

  if (!sent) {
    console.error("Failed to send verification email.");
    process.exit(1);
  }

  console.log(`Password reset email sent to ${email}`);
  console.log(`Code: ${verificationCode}`);
})();
