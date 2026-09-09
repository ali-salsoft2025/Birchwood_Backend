/**
 * Full parent-auth API test suite against local Birchwood backend.
 * Run: node scripts/test-parent-auth-flow.js
 */
const BASE = process.env.API_BASE || "http://localhost:3031/api";

const results = [];
function log(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? " — " + detail : ""}`);
}

async function req(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text, message: text?.slice(0, 120) };
  }
  return { status: res.status, json };
}

function decodeEncodedEmail(encoded) {
  const raw = Buffer.from(encoded, "base64").toString("ascii");
  return JSON.parse(raw);
}

async function main() {
  console.log(`Testing ${BASE}\n`);

  const unique = Date.now();
  const testEmail = `parent.test.${unique}@birchwood.test`;
  const weakPass = "password";
  const strongPass = "Parent@Test99";
  const strongPass2 = "Parent@Test88";
  const seedEmail = "james.william@birchwood.local";
  const seedPass = "Parent@12345";

  // --- Validation: signup missing fields ---
  {
    const { status, json } = await req("POST", "/auth/signup", {
      email: testEmail,
      password: strongPass,
    });
    log(
      "Signup rejects incomplete body",
      status === 400 && json.status === false,
      `${status} ${json.message}`,
    );
  }

  // --- Validation: weak password ---
  {
    const { status, json } = await req("POST", "/auth/signup", {
      fatherFirstName: "John",
      fatherLastName: "Tester",
      motherFirstName: "Jane",
      motherLastName: "Tester",
      email: `weak.${unique}@birchwood.test`,
      phone: "5551112222",
      password: weakPass,
    });
    log(
      "Signup rejects weak password",
      status === 400 && /weak/i.test(json.message || ""),
      json.message,
    );
  }

  // --- Validation: invalid email ---
  {
    const { status, json } = await req("POST", "/auth/signup", {
      fatherFirstName: "John",
      fatherLastName: "Tester",
      motherFirstName: "Jane",
      motherLastName: "Tester",
      email: "not-an-email",
      phone: "5551112222",
      password: strongPass,
    });
    log(
      "Signup rejects invalid email",
      status === 400 && json.status === false,
      json.message,
    );
  }

  // --- Validation: short father first name (schema min 3) ---
  {
    const { status, json } = await req("POST", "/auth/signup", {
      fatherFirstName: "Jo",
      fatherLastName: "Tester",
      motherFirstName: "Jane",
      motherLastName: "Tester",
      email: `shortname.${unique}@birchwood.test`,
      phone: "5551112222",
      password: strongPass,
    });
    log(
      "Signup rejects short fatherFirstName (min 3)",
      status >= 400 || json.status === false,
      `${status} ${json.message}`,
    );
  }

  // --- Happy signup ---
  let signupOk = false;
  {
    const { status, json } = await req("POST", "/auth/signup", {
      fatherFirstName: "John",
      fatherLastName: "Tester",
      motherFirstName: "Jane",
      motherLastName: "Tester",
      email: testEmail,
      phone: "5559988776",
      password: strongPass,
      address: "123 Test Lane",
      city: "Jakarta",
      state: "DKI",
    });
    signupOk = status === 200 && json.status === true && json.data?.parent;
    log(
      "Signup succeeds with full parent payload",
      signupOk,
      `${status} ${json.message} token=${Boolean(json.data?.token)}`,
    );
    log(
      "Signup does NOT return JWT (must signin after)",
      signupOk && !json.data?.token,
      json.data?.token ? "unexpected token" : "no token (expected)",
    );
  }

  // --- Duplicate email ---
  {
    const { status, json } = await req("POST", "/auth/signup", {
      fatherFirstName: "John",
      fatherLastName: "Tester",
      motherFirstName: "Jane",
      motherLastName: "Tester",
      email: testEmail,
      phone: "5559988776",
      password: strongPass,
    });
    log(
      "Signup rejects duplicate email",
      status === 400 || json.status === false,
      `${status} ${json.message}`,
    );
  }

  // --- Signin validation ---
  {
    const { status, json } = await req("POST", "/auth/signin", {
      email: "bad",
      password: "x",
    });
    log(
      "Signin rejects invalid email format",
      status === 400 && json.status === false,
      json.message,
    );
  }

  {
    const { status, json } = await req("POST", "/auth/signin", {
      email: testEmail,
      password: "WrongPass@1",
    });
    log(
      "Signin rejects wrong password",
      json.status === false || status >= 400,
      `${status} ${json.message}`,
    );
  }

  {
    const { status, json } = await req("POST", "/auth/signin", {
      email: "nobody.exists@birchwood.test",
      password: strongPass,
    });
    log(
      "Signin rejects unknown email",
      json.status === false || status >= 400,
      `${status} ${json.message}`,
    );
  }

  // --- Happy signin (new user) ---
  let userToken = null;
  {
    const { status, json } = await req("POST", "/auth/signin", {
      email: testEmail,
      password: strongPass,
    });
    userToken = json.data?.token || null;
    log(
      "Signin succeeds for new parent (USER token)",
      status === 200 && json.status === true && !!userToken,
      `tokenType check via profile`,
    );
  }

  // --- Seeded parent signin ---
  let seedToken = null;
  {
    const { status, json } = await req("POST", "/auth/signin", {
      email: seedEmail,
      password: seedPass,
    });
    seedToken = json.data?.token || null;
    log(
      "Signin succeeds for seeded parent",
      status === 200 && json.status === true && !!seedToken,
      json.message,
    );
  }

  // --- User token works on parent profile ---
  {
    const { status, json } = await req(
      "GET",
      "/profile/getProfile",
      null,
      userToken,
    );
    log(
      "USER token accesses /profile/getProfile",
      status === 200 && json.status === true,
      `${status} ${json.message || ""}`,
    );
  }

  // --- No token rejected ---
  {
    const { status, json } = await req("GET", "/profile/getProfile");
    log(
      "Protected route rejects missing token",
      status === 401 || status === 403 || json.status === false,
      `${status} ${json.message || ""}`,
    );
  }

  // --- Admin route should reject user token ---
  {
    const { status, json } = await req(
      "GET",
      "/admin/parent/getAllParents",
      null,
      userToken,
    );
    // path may differ — try common admin paths
    const alt = await req("GET", "/admin/dashboard", null, userToken);
    const blocked =
      (status === 401 || status === 403 || json.status === false) ||
      (alt.status === 401 || alt.status === 403 || alt.json?.status === false) ||
      status === 404;
    log(
      "USER token cannot use admin APIs (or route 404)",
      blocked,
      `admin/parent=${status} dashboard=${alt.status}`,
    );
  }

  // --- Forgot password: unknown email ---
  {
    const { status, json } = await req("POST", "/auth/emailVerificationCode", {
      email: "ghost.parent@birchwood.test",
    });
    log(
      "Forgot password rejects unknown email",
      status === 400 && json.status === false,
      json.message,
    );
  }

  // --- Forgot password step 1 ---
  let encodedEmail = null;
  let otpCode = null;
  {
    const { status, json } = await req("POST", "/auth/emailVerificationCode", {
      email: testEmail,
    });
    encodedEmail = json.data?.encodedEmail || null;
    if (encodedEmail) {
      try {
        const decoded = decodeEncodedEmail(encodedEmail);
        otpCode = decoded.code;
        log(
          "Forgot password sends code (encodedEmail contains email+code)",
          status === 201 && json.status === true && decoded.email === testEmail,
          `code=${otpCode}`,
        );
      } catch (e) {
        log("Decode encodedEmail", false, e.message);
      }
    } else {
      log(
        "Forgot password step 1",
        false,
        `${status} ${json.message} (SMTP may have failed)`,
      );
    }
  }

  // --- Verify with WRONG code ---
  if (otpCode) {
    const { status, json } = await req("POST", "/auth/verifyRecoverCode", {
      email: testEmail,
      code: "0000",
    });
    log(
      "OTP verify rejects wrong code",
      status === 400 && json.status === false,
      json.message,
    );
  }

  // --- Verify with encodedEmail as email (frontend bug case) ---
  if (encodedEmail && otpCode) {
    const { status, json } = await req("POST", "/auth/verifyRecoverCode", {
      email: encodedEmail,
      code: otpCode,
    });
    log(
      "OTP verify FAILS if client sends encodedEmail as email (current app bug)",
      status === 400 || json.status === false,
      `${status} ${json.message}`,
    );
  }

  // --- Verify with correct email+code ---
  if (otpCode) {
    const { status, json } = await req("POST", "/auth/verifyRecoverCode", {
      email: testEmail,
      code: otpCode,
    });
    log(
      "OTP verify succeeds with plain email + 4-digit code",
      status === 200 && json.status === true,
      json.message,
    );
  }

  // --- Reset with weak password ---
  if (otpCode) {
    const { status, json } = await req("POST", "/auth/resetPassword", {
      email: testEmail,
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

  // --- Reset with mismatched confirm ---
  if (otpCode) {
    const { status, json } = await req("POST", "/auth/resetPassword", {
      email: testEmail,
      password: strongPass2,
      confirmPassword: "Parent@Mismatch1",
      code: otpCode,
    });
    log(
      "Reset rejects mismatched confirmPassword",
      status === 400 && json.status === false,
      json.message,
    );
  }

  // --- Reset success ---
  if (otpCode) {
    const { status, json } = await req("POST", "/auth/resetPassword", {
      email: testEmail,
      password: strongPass2,
      confirmPassword: strongPass2,
      code: otpCode,
    });
    log(
      "Reset password succeeds",
      (status === 201 || status === 200) && json.status === true,
      `${status} ${json.message}`,
    );
  }

  // --- Signin with old password fails ---
  {
    const { status, json } = await req("POST", "/auth/signin", {
      email: testEmail,
      password: strongPass,
    });
    log(
      "Signin fails with old password after reset",
      json.status === false || status >= 400,
      `${status} ${json.message}`,
    );
  }

  // --- Signin with new password ---
  {
    const { status, json } = await req("POST", "/auth/signin", {
      email: testEmail,
      password: strongPass2,
    });
    log(
      "Signin succeeds with new password (USER token)",
      status === 200 && json.status === true && !!json.data?.token,
      json.message,
    );
  }

  // --- Reuse OTP should fail ---
  if (otpCode) {
    const { status, json } = await req("POST", "/auth/resetPassword", {
      email: testEmail,
      password: strongPass,
      confirmPassword: strongPass,
      code: otpCode,
    });
    log(
      "Used OTP cannot reset again",
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
