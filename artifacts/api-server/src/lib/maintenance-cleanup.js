import { isNotNull, lt, eq, count, inArray } from "drizzle-orm";
import { logger } from "./logger.js";

let tablePromise;
function getTables() {
  if (!tablePromise) {
    tablePromise = import("@workspace/db").then((m) => ({
      users: m.usersTable,
      sessions: m.studySessionsTable,
      documents: m.documentsTable,
      messages: m.messagesTable,
      quizResults: m.quizResultsTable,
      flashcardProgress: m.flashcardProgressTable,
    }));
  }
  return tablePromise;
}

export const BATCH_SIZE = 200;
export const ABANDONED_USER_DAYS_DEFAULT = 30;
export const CLEANUP_SCOPES = ["soft-deleted-sessions", "abandoned-users"];

function chunked(values, size = BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

export function resolveCutoff(days, now = new Date()) {
  const num = Number(days);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("agedDays must be a non-negative number");
  }
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() - Math.floor(num));
  return result;
}

export function requireMaintenanceSecret(given, expected = process.env.MAINTENANCE_SECRET) {
  if (!expected) {
    throw new Error(
      "MAINTENANCE_SECRET is not configured. Maintenance cleanup is disabled server-side."
    );
  }
  if (!given || typeof given !== "string" || given !== expected) {
    throw new Error("Invalid or missing maintenance secret");
  }
}

export function resolveScopes(input) {
  const scopes = new Set(CLEANUP_SCOPES);
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("At least one cleanup scope is required");
  }
  for (const scope of input) {
    if (!scopes.has(scope)) {
      throw new Error(`Unknown cleanup scope: ${scope}`);
    }
  }
  return [...new Set(input)];
}

async function countSoftDeleted(db) {
  const { sessions } = await getTables();
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(isNotNull(sessions.deletedAt));
  return rows.map((r) => r.id);
}

async function countAbandonedUsers(db, cutoff) {
  const { users, sessions, quizResults, flashcardProgress } = await getTables();
  const userRows = await db
    .select({ id: users.id, sessions: count(sessions.id) })
    .from(users)
    .leftJoin(sessions, eq(sessions.userId, users.id))
    .where(lt(users.createdAt, cutoff))
    .groupBy(users.id);

  const candidateIds = userRows
    .filter((u) => Number(u.sessions) === 0)
    .map((u) => u.id);

  if (candidateIds.length === 0) return [];

  const [quizRows, flashRows] = await Promise.all([
    candidateIds.length
      ? db
          .select({ userId: quizResults.userId })
          .from(quizResults)
          .where(inArray(quizResults.userId, candidateIds))
      : Promise.resolve([]),
    candidateIds.length
      ? db
          .select({ userId: flashcardProgress.userId })
          .from(flashcardProgress)
          .where(inArray(flashcardProgress.userId, candidateIds))
      : Promise.resolve([]),
  ]);

  const protectedIds = new Set([
    ...quizRows.map((r) => r.userId),
    ...flashRows.map((r) => r.userId),
  ]);
  return candidateIds.filter((id) => !protectedIds.has(id));
}

async function deleteSoftDeletedSessions(tx) {
  const { sessions, messages, documents, quizResults, flashcardProgress } = await getTables();
  const ids = await countSoftDeleted(tx);
  let removedSessions = 0;
  for (const batch of chunked(ids)) {
    removedSessions += batch.length;
    await tx.delete(messages).where(inArray(messages.sessionId, batch));
    await tx.delete(documents).where(inArray(documents.sessionId, batch));
    await tx.delete(quizResults).where(inArray(quizResults.sessionId, batch));
    await tx.delete(flashcardProgress).where(inArray(flashcardProgress.sessionId, batch));
    await tx.delete(sessions).where(inArray(sessions.id, batch));
  }
  return removedSessions;
}

async function deleteAbandonedUsers(tx, cutoff) {
  const { users } = await getTables();
  const ids = await countAbandonedUsers(tx, cutoff);
  if (ids.length === 0) return 0;
  await tx.delete(users).where(inArray(users.id, ids));
  return ids.length;
}

export async function runCleanup({
  secret,
  dryRun = true,
  scopes = [],
  agedDays = ABANDONED_USER_DAYS_DEFAULT,
  now = new Date(),
  db,
}) {
  requireMaintenanceSecret(secret);
  const resolved = resolveScopes(scopes);

  const summary = [];
  for (const scope of resolved) {
    if (scope === "soft-deleted-sessions") {
      const count = dryRun ? (await countSoftDeleted(db)).length : 0;
      if (dryRun) {
        summary.push({ scope, count });
        logger.info({ component: "maintenance", scope, dryRun: true, count }, "Cleanup dry-run");
        continue;
      }
      const removed = await deleteSoftDeletedSessions(db);
      logger.info({ component: "maintenance", scope, dryRun: false, count: removed }, "Cleanup ran");
      summary.push({ scope, count: removed });
    } else if (scope === "abandoned-users") {
      const cutoffDate = resolveCutoff(agedDays, now);
      if (dryRun) {
        const count = (await countAbandonedUsers(db, cutoffDate)).length;
        logger.info({ component: "maintenance", scope, dryRun: true, agedDays, count }, "Cleanup dry-run");
        summary.push({ scope, count });
        continue;
      }
      const count = await deleteAbandonedUsers(db, cutoffDate);
      logger.info({ component: "maintenance", scope, dryRun: false, agedDays, count }, "Cleanup ran");
      summary.push({ scope, count });
    }
  }

  return { dryRun, scopes: summary };
}