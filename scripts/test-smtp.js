/**
 * One-off SMTP connectivity test. Pass credentials via env vars only.
 *
 *   SMTP_HOST=thebirchwoodacademy.com SMTP_USER=... SMTP_PASS=... node scripts/test-smtp.js
 */
const nodemailer = require('nodemailer');

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const to = process.env.SMTP_TO || user;

if (!user || !pass) {
  console.error('Set SMTP_USER and SMTP_PASS environment variables.');
  process.exit(1);
}

const hosts = [
  process.env.SMTP_HOST || 'thebirchwoodacademy.com',
  'mail.thebirchwoodacademy.com',
].filter((h, i, arr) => arr.indexOf(h) === i);

const attempts = [];
for (const host of hosts) {
  attempts.push({host, port: 587, secure: false, name: `${host}:587 STARTTLS`});
  attempts.push({host, port: 465, secure: true, name: `${host}:465 SSL`});
}

async function tryConfig({host, port, secure, name}) {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {user, pass},
    tls: {rejectUnauthorized: false},
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });

  try {
    await transporter.verify();
    const info = await transporter.sendMail({
      from: `"Birchwood SMTP Test" <${user}>`,
      to,
      subject: 'Birchwood SMTP test',
      text: `SMTP test OK via ${name} at ${new Date().toISOString()}`,
      html: `<p>SMTP test OK via <strong>${name}</strong> at ${new Date().toISOString()}</p>`,
    });
    return {ok: true, name, messageId: info.messageId, response: info.response};
  } catch (err) {
    return {ok: false, name, error: err.message, code: err.code};
  } finally {
    transporter.close();
  }
}

(async () => {
  console.log(`Testing SMTP for ${user} (send to ${to})...\n`);
  for (const attempt of attempts) {
    const result = await tryConfig(attempt);
    if (result.ok) {
      console.log(`SUCCESS: ${result.name}`);
      console.log(`  messageId: ${result.messageId}`);
      console.log(`  response: ${result.response}`);
      process.exit(0);
    }
    console.log(`FAIL: ${result.name}`);
    console.log(`  ${result.code || 'error'}: ${result.error}\n`);
  }
  process.exit(1);
})();
