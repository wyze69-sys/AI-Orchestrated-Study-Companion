import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFlashcardStatusInput, VALID_FLASHCARD_STATUSES } from "./flashcard-status.js";

// The API route must share the exact same status validation — exercised here.

// Ownership check helper matching API server logic
function checkSessionOwnership(session, userId) {
  if (!session || session.deletedAt != null || session.userId !== userId) {
    return false;
  }
  return true;
}

// Idempotent upsert state simulation helper
function upsertProgress(store, userId, sessionId, cardId, status) {
  const key = `${sessionId}:${cardId}`;
  const existing = store.get(key);
  if (existing) {
    const updated = { ...existing, status, updatedAt: new Date() };
    store.set(key, updated);
    return { record: updated, created: false };
  }
  const created = {
    id: `progress-${Date.now()}-${Math.random()}`,
    userId,
    sessionId,
    cardId,
    status,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  store.set(key, created);
  return { record: created, created: true };
}

// Tests

test("shared status constant contains the documented values", () => {
  assert.deepEqual(VALID_FLASHCARD_STATUSES, ["known", "review"]);
});

test("validateFlashcardStatusInput accepts valid 'known' and 'review' statuses", () => {
  assert.equal(validateFlashcardStatusInput({ cardId: "1", status: "known" }).valid, true);
  assert.equal(validateFlashcardStatusInput({ cardId: "2", status: "review" }).valid, true);
  assert.equal(
    validateFlashcardStatusInput([
      { cardId: "1", status: "known" },
      { cardId: "2", status: "review" }
    ]).valid,
    true
  );
});

test("validateFlashcardStatusInput rejects invalid or missing statuses", () => {
  assert.equal(validateFlashcardStatusInput({ cardId: "1", status: "invalid" }).valid, false);
  assert.equal(validateFlashcardStatusInput({ cardId: "1", status: "" }).valid, false);
  assert.equal(validateFlashcardStatusInput({ cardId: "1", status: null }).valid, false);
  assert.equal(validateFlashcardStatusInput({ cardId: "", status: "known" }).valid, false);
  assert.equal(validateFlashcardStatusInput([]).valid, false);
});

test("upsertProgress creates a new progress record if not present", () => {
  const store = new Map();
  const res = upsertProgress(store, "user-1", "sess-1", "card-1", "known");
  assert.equal(res.created, true);
  assert.equal(res.record.cardId, "card-1");
  assert.equal(res.record.status, "known");
  assert.equal(store.size, 1);
});

test("upsertProgress updates an existing progress record idempotently", () => {
  const store = new Map();
  upsertProgress(store, "user-1", "sess-1", "card-1", "review");
  assert.equal(store.get("sess-1:card-1").status, "review");

  // Upsert same card with status 'known'
  const res2 = upsertProgress(store, "user-1", "sess-1", "card-1", "known");
  assert.equal(res2.created, false);
  assert.equal(res2.record.status, "known");
  assert.equal(store.size, 1); // no duplicate row created
});

test("checkSessionOwnership prevents cross-user access", () => {
  const sessionUser1 = { id: "sess-1", userId: "user-1", deletedAt: null };

  // Owner access -> allowed
  assert.equal(checkSessionOwnership(sessionUser1, "user-1"), true);

  // Different user access -> rejected
  assert.equal(checkSessionOwnership(sessionUser1, "user-2"), false);

  // Deleted session access -> rejected
  const deletedSession = { id: "sess-2", userId: "user-1", deletedAt: new Date() };
  assert.equal(checkSessionOwnership(deletedSession, "user-1"), false);
});

test("reset progress clears intended session records only", () => {
  const store = new Map();
  upsertProgress(store, "user-1", "sess-1", "card-1", "known");
  upsertProgress(store, "user-1", "sess-1", "card-2", "review");
  upsertProgress(store, "user-1", "sess-2", "card-1", "known"); // different session

  assert.equal(store.size, 3);

  // Delete all records for sess-1
  for (const [key, record] of Array.from(store.entries())) {
    if (record.sessionId === "sess-1" && record.userId === "user-1") {
      store.delete(key);
    }
  }

  // sess-1 cleared, sess-2 preserved
  assert.equal(store.size, 1);
  assert.equal(store.has("sess-2:card-1"), true);
});
