import "../env.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  studySessionsTable,
  documentsTable,
  messagesTable,
  quizResultsTable,
  flashcardProgressTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const BASE = "http://localhost:5000/api";
const PASS = "TestPassword123!";

async function request(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, data };
}

let failures = 0;
function check(label, ok, extra = "") {
  const marker = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`[${marker}] ${label}${extra ? ` (${extra})` : ""}`);
}

async function seedUser(prefix) {
  const id = `${prefix}-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const hash = await bcrypt.hash(PASS, 10);
  const email = `${id}@example.com`;
  await db.insert(usersTable).values({ id, email, passwordHash: hash });
  return { id, email, token: jwt.sign({ id, email }, process.env.JWT_SECRET) };
}

async function runCount(user) {
  const sessions = await db
    .select({ id: studySessionsTable.id })
    .from(studySessionsTable)
    .where(eq(studySessionsTable.userId, user.id));
  const sessionIds = sessions.map((s) => s.id);
  const [u, d, m, q, f] = await Promise.all([
    db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, user.id)),
    sessionIds.length
      ? db.select({ id: documentsTable.id }).from(documentsTable).where(inArray(documentsTable.sessionId, sessionIds))
      : [],
    sessionIds.length
      ? db.select({ id: messagesTable.id }).from(messagesTable).where(inArray(messagesTable.sessionId, sessionIds))
      : [],
    db.select({ id: quizResultsTable.id }).from(quizResultsTable).where(eq(quizResultsTable.userId, user.id)),
    db.select({ id: flashcardProgressTable.id }).from(flashcardProgressTable).where(eq(flashcardProgressTable.userId, user.id)),
  ]);
  return {
    user: u.length,
    sessions: sessions.length,
    documents: d.length,
    messages: m.length,
    quiz: q.length,
    flashcards: f.length,
  };
}

async function main() {
  console.log("Starting live account-deletion verification...");
  await fetch(`${BASE}/test/reset-rate-limits`, { method: "POST" }).catch(() => {});

  const alice = await seedUser("alice-qa");
  const bob = await seedUser("bob-qa");
  const suffix = randomUUID().slice(0, 8);
  const pool = db.$client;

  const created = await request("/sessions", { method: "POST", token: alice.token, body: { title: "Account Deletion QA" } });
  check("A creates session", created.status === 201 && !!created.data?.id, created.status + "");
  const sessionId = created.data.id;

  const docId = randomUUID();
  await db.insert(documentsTable).values({
    id: docId,
    sessionId,
    filename: "notes.txt",
    mimeType: "text/plain",
    content: "deletion test content",
  });
  const msgId = randomUUID();
  await db.insert(messagesTable).values({
    id: msgId,
    sessionId,
    documentId: docId,
    role: "assistant",
    content: "A generated message",
    sources: [],
  });
  const quiz = await request(`/sessions/${sessionId}/quizzes/results`, {
    method: "POST",
    token: alice.token,
    body: { quizId: "del-quiz", totalQuestions: 2, score: 2, percentage: 100, answerState: { "1": "A", "2": "A" } },
  });
  check("quiz saved", quiz.status === 200 && quiz.data?.success === true);
  const cards = await request(`/sessions/${sessionId}/flashcards/progress`, {
    method: "POST",
    token: alice.token,
    body: [{ cardId: "card-1", status: "known" }],
  });
  check("flashcard saved", cards.status === 200 && cards.data?.success === true);

  const bobSession = await request("/sessions", { method: "POST", token: bob.token, body: { title: "Bob session" } });
  check("bob created session", bobSession.status === 201 && !!bobSession.data?.id);

  const alive = await request("/sessions", { token: alice.token });
  check("pre-delete alice token works", alive.status === 200);

  // Rollback probe: RESTRICT FK blocks user delete -> transaction must roll back.
  const probeTable = `qa_delete_probe_${suffix}`;
  await pool.query(`CREATE TABLE ${probeTable} (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT)`);
  await pool.query(`INSERT INTO ${probeTable} (id, user_id) VALUES ($1, $2)`, ["probe-alice", alice.id]);

  const blocked = await request("/auth/me", { method: "DELETE", token: alice.token });
  check("delete fails while FK blocks (500, rolled back)", blocked.status === 500, blocked.status + "");

  const afterBlocked = await runCount(alice);
  check(
    "rollback preserved all rows",
    afterBlocked.user === 1 && afterBlocked.sessions === 1 && afterBlocked.quiz === 1 && afterBlocked.flashcards === 1,
    JSON.stringify(afterBlocked)
  );
  const stillAlive = await request("/sessions", { token: alice.token });
  check("token still valid after rollback", stillAlive.status === 200);

  await pool.query(`DROP TABLE ${probeTable}`);

  const del = await request("/auth/me", { method: "DELETE", token: alice.token });
  check("DELETE /auth/me succeeds", del.status === 200 && del.data?.success === true, del.status + " " + JSON.stringify(del.data));

  const afterAlice = await runCount(alice);
  check(
    "all alice rows removed",
    afterAlice.user === 0 && afterAlice.sessions === 0 && afterAlice.documents === 0 && afterAlice.messages === 0 && afterAlice.quiz === 0 && afterAlice.flashcards === 0,
    JSON.stringify(afterAlice)
  );

  const list = await request("/sessions", { token: alice.token });
  check("deleted token rejected on /sessions", list.status === 401);
  const progress = await request("/progress/summary", { token: alice.token });
  check("deleted token rejected on /progress/summary", progress.status === 401);
  const login = await request("/auth/login", { method: "POST", body: { email: alice.email, password: PASS } });
  check("login rejected after deletion", login.status === 401, login.status + "");
  const reDelete = await request("/auth/me", { method: "DELETE", token: alice.token });
  check("repeat delete is safe (401)", reDelete.status === 401);

  const bobAfter = await request("/sessions", { token: bob.token });
  check("bob unaffected by alice deletion", bobAfter.status === 200 && bobAfter.data.some((s) => s.id === bobSession.data.id));

  const maint = await request("/maintenance/cleanup", {
    method: "POST",
    token: alice.token,
    body: { scope: "soft-deleted-sessions" },
  });
  check("no public maintenance endpoint (404)", maint.status === 404, maint.status + "");

  await request("/auth/me", { method: "DELETE", token: bob.token });
  await pool.query(`DROP TABLE IF EXISTS ${probeTable}`).catch(() => {});

  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;

  await db.$client.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await db.$client.end().catch(() => {});
});