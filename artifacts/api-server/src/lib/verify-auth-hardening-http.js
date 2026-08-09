import "../env.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:5000/api";
const PASS = "TestPassword123!";

let failures = 0;
function check(label, ok, extra = "") {
  const marker = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`[${marker}] ${label}${extra ? ` (${extra})` : ""}`);
}

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

async function main() {
  console.log("Starting live auth-hardening verification...");
  await fetch(`${BASE}/test/reset-rate-limits`, { method: "POST" }).catch(() => {});
  const secret = process.env.JWT_SECRET;

  // 1. Email normalization + registration validation.
  const mixedEmail = `  MixedCase${Date.now()}@Example.COM `;
  const reg = await req("/auth/register", { method: "POST", body: { email: mixedEmail, password: PASS } });
  check("register normalizes email", reg.status === 201 && reg.data?.user?.email === mixedEmail.trim().toLowerCase(), reg.data?.user?.email);
  const normalizedEmail = reg.data.user.email;

  const loginMixed = await req("/auth/login", { method: "POST", body: { email: mixedEmail, password: PASS } });
  check("login with mixed-case email works", loginMixed.status === 200 && !!loginMixed.data?.token);

  const badEmail = await req("/auth/register", { method: "POST", body: { email: "not-an-email", password: PASS } });
  check("register rejects malformed email (400)", badEmail.status === 400, badEmail.status + "");
  const longEmail = await req("/auth/register", { method: "POST", body: { email: "x@example.com" + "y".repeat(300), password: PASS } });
  check("register rejects overlong email (400)", longEmail.status === 400);
  const shortPass = await req("/auth/register", { method: "POST", body: { email: "ok@example.com", password: "short" } });
  check("register rejects short password (400)", shortPass.status === 400);

  // 2. Generic login messages (no account enumeration).
  const noUser = await req("/auth/login", { method: "POST", body: { email: "ghost-" + Date.now() + "@example.com", password: "WrongPassword1!" } });
  check("login for unknown user is generic 401", noUser.status === 401 && noUser.data?.error === "Invalid email or password", noUser.data?.error);
  const wrongPass = await req("/auth/login", { method: "POST", body: { email: normalizedEmail, password: "WrongPassword1!" } });
  check("login for wrong password is generic 401", wrongPass.status === 401 && wrongPass.data?.error === "Invalid email or password");

  const goodToken = reg.data.token;
  const createSess = await req("/sessions", { method: "POST", token: goodToken, body: { title: "auth hardening" } });
  check("valid token works on protected route", createSess.status === 201 && !!createSess.data?.id, createSess.status + "");
  const sessionId = createSess.data.id;

  // 3. Token edge cases all rejected with 401.
  const expired = jwt.sign({ id: reg.data.user.id, email: normalizedEmail }, secret, { expiresIn: "-1h" });
  check("expired token -> 401", (await req("/sessions", { token: expired })).status === 401);

  const wrongSig = jwt.sign({ id: reg.data.user.id, email: normalizedEmail }, "a".repeat(80));
  check("wrong-signature token -> 401", (await req("/sessions", { token: wrongSig })).status === 401);

  const wrongAlg = jwt.sign({ id: reg.data.user.id, email: normalizedEmail }, secret, { algorithm: "HS512" });
  check("wrong-algorithm token -> 401", (await req("/sessions", { token: wrongAlg })).status === 401);

  check("malformed token -> 401", (await req("/sessions", { token: "not.a.token" })).status === 401);
  check("missing header -> 401", (await req("/sessions")).status === 401);
  check("empty bearer -> 401", (await req("/sessions", { token: "" })).status === 401);

  // 4. Cross-user isolation: B's token cannot access A's session.
  const otherId = "auth-other-" + Date.now();
  const otherHash = await bcrypt.hash(PASS, 10);
  await db.insert(usersTable).values({ id: otherId, email: otherId + "@example.com", passwordHash: otherHash });
  const otherToken = jwt.sign({ id: otherId, email: otherId + "@example.com" }, secret);

  const otherReads = await req(`/sessions/${sessionId}`, { token: otherToken });
  check("cross-user session access denied (404)", otherReads.status === 404, otherReads.status + "");
  const otherReadsMsg = await req(`/sessions/${sessionId}/messages`, { token: otherToken });
  check("cross-user messages access denied (404)", otherReadsMsg.status === 404, otherReadsMsg.status + "");

  // 5. Payload-shape token (id missing) -> 401.
  const shapeMissing = jwt.sign({ email: normalizedEmail }, secret);
  check("token missing id -> 401", (await req("/sessions", { token: shapeMissing })).status === 401);

  // Cleanup.
  await req("/auth/me", { method: "DELETE", token: goodToken });
  await db.delete(usersTable).where(eq(usersTable.id, otherId));

  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
  await db.$client.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await db.$client.end().catch(() => {});
});