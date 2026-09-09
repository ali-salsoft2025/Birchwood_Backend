/**
 * Admin login + forgot-password + SMTP test against local backend.
 * Run: node scripts/test-admin-auth-flow.js
 *
 * Does not print passwords, tokens, or reset codes.
 */
require("../config/loadEnv");
const nodemailer = require("nodemailer");

const BASE = process.env.API_BASE || "http://localhost:3031/api";
const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD;

const results = [];
function log(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text.slice(0, 160) };
  }
  return { status: res.status, json };
}

function decodeEncodedEmail(encoded) {
  return JSON.parse(Buffer.from(encoded, "base64").toString("ascii"));
}

async function verifySmtp() {
  const port = Number(process.env.MAIL_PORT) || 587;
  const encryption = String(process.env.MAIL_ENCRYPTION || "tls").toLowerCase();
  const secure = encryption === "ssl" || port === 465;
  const transporter = nodemailer.createTransport({
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
    connectionTimeout: 20000,
    greetingTimeout: 20000,
  });
  try {
    await transporter.verify();
    return {
      ok: true,
      detail: `${process.env.MAIL_HOST}:${port} as ${process.env.MAIL_USERNAME}`,
    };
  } catch (err) {
    return { ok: false, detail: err.message };
  } finally {
    transporter.close();
  }
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD missing from env");
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 8) {
    console.error(
      "ADMIN_SEED_PASSWORD looks truncated. Quote it in .env if it contains #.",
    );
    process.exit(1);
  }

  console.log(`Testing ${BASE}\n`);

  {
    const res = await fetch("http://localhost:3031/api/health");
    const json = await res.json().catch(() => ({}));
    log("Health check", res.ok, `${res.status} ${json.status || json.message || ""}`);
  }

  {
    const smtp = await verifySmtp();
    log("SMTP transporter.verify()", smtp.ok, smtp.detail);
  }

  {
    const { status, json } = await req("POST", "/admin/auth/signin", {
      email: "not-an-email",
      password: "x",
    });
    log(
      "Signin rejects invalid email",
      status === 400 && json.status === false,
      json.message,
    );
  }

  {
    const { status, json } = await req("POST", "/admin/auth/signin", {
      email: ADMIN_EMAIL,
      password: "WrongPass#1",
    });
    log(
      "Signin rejects wrong password",
      json.status === false,
      `${status} ${json.message}`,
    );
  }

  {
    const { status, json } = await req("POST", "/admin/auth/signin", {
      email: "nobody.exists@birchwood.test",
      password: ADMIN_PASSWORD,
    });
    log(
      "Signin rejects unknown admin",
      json.status === false,
      `${status} ${json.message}`,
    );
  }

  {
    const { status, json } = await req("POST", "/admin/auth/signin", {
      email: ADMIN_EMAIL.toUpperCase(),
      password: ADMIN_PASSWORD,
    });
    log(
      "Signin succeeds (mixed-case email)",
      status === 200 && json.status === true && !!json.data?.token && !!json.data?.user,
      json.message,
    );
  }

  {
    const { status, json } = await req("POST", "/admin/auth/emailVerificationCode", {
      email: "ghost.admin@birchwood.test",
    });
    log(
      "Forgot password rejects unknown email",
      status === 400 && json.status === false,
      json.message,
    );
  }

  let otpCode = null;
  {
    const { status, json } = await req("POST", "/admin/auth/emailVerificationCode", {
      email: ADMIN_EMAIL.toUpperCase(),
    });
    const encoded = json.data?.encodedEmail;
    if (encoded) {
      const decoded = decodeEncodedEmail(encoded);
      otpCode = decoded.code;
      log(
        "Forgot password sends SMTP reset email",
        status === 201 &&
          json.status === true &&
          decoded.email === ADMIN_EMAIL.toLowerCase() &&
          String(otpCode).length === 4,
        json.message,
      );
    } else {
      log(
        "Forgot password sends SMTP reset email",
        false,
        `${status} ${json.message || "no encodedEmail (SMTP likely failed)"}`,
      );
    }
  }

  if (otpCode) {
    const { status, json } = await req("POST", "/admin/auth/verifyRecoverCode", {
      email: ADMIN_EMAIL,
      code: "0000",
    });
    log(
      "Verify rejects wrong code",
      status === 400 && json.status === false,
      json.message,
    );
  }

  if (otpCode) {
    const { status, json } = await req("POST", "/admin/auth/verifyRecoverCode", {
      email: ADMIN_EMAIL.toUpperCase(),
      code: otpCode,
    });
    log(
      "Verify succeeds with 4-digit code",
      status === 200 && json.status === true,
      json.message,
    );
  }

  if (otpCode) {
    const { status, json } = await req("POST", "/admin/auth/resetPassword", {
      email: ADMIN_EMAIL,
      password: "weak",
      confirmPassword: "weak",
      code: otpCode,
    });
    log(
      "Reset rejects weak password",
      status === 400 && json.status === false,
      json.message,
    );
  }

  if (otpCode) {
    const { status, json } = await req("POST", "/admin/auth/resetPassword", {
      email: ADMIN_EMAIL,
      password: "Temp#Reset9xQ!",
      confirmPassword: "Temp#Mismatch9xQ!",
      code: otpCode,
    });
    log(
      "Reset rejects mismatched confirmPassword",
      status === 400 && json.status === false,
      json.message,
    );
  }

  if (otpCode) {
    const { status, json } = await req("POST", "/admin/auth/resetPassword", {
      email: ADMIN_EMAIL.toUpperCase(),
      password: ADMIN_PASSWORD,
      confirmPassword: ADMIN_PASSWORD,
      code: otpCode,
    });
    log(
      "Reset password succeeds (same seed password)",
      (status === 201 || status === 200) && json.status === true,
      `${status} ${json.message}`,
    );
  }

  {
    const { status, json } = await req("POST", "/admin/auth/signin", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    log(
      "Signin still works after reset",
      status === 200 && json.status === true && !!json.data?.token,
      json.message,
    );
  }

  if (otpCode) {
    const { status, json } = await req("POST", "/admin/auth/resetPassword", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      confirmPassword: ADMIN_PASSWORD,
      code: otpCode,
    });
    log(
      "Used reset code cannot be reused",
      status === 400 || json.status === false,
      `${status} ${json.message}`,
    );
  }

  console.log("\n========== SUMMARY ==========");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`${passed}/${results.length} passed`);
  if (failed.length) {
    console.log("Failed:");
    failed.forEach((f) => console.log(` - ${f.name}: ${f.detail}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
