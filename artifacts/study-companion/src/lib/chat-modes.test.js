import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_MODES,
  QUICK_ACTION_MODES,
  quickActionMode,
  buildChatPayload
} from "./chat-modes.js";

test("quick actions map to their documented modes", () => {
  assert.equal(QUICK_ACTION_MODES.summarise, "summary");
  assert.equal(QUICK_ACTION_MODES.flashcards, "flashcards");
  assert.equal(QUICK_ACTION_MODES.explain, "explain");
  assert.equal(QUICK_ACTION_MODES.quiz, "quiz");
  assert.equal(quickActionMode("summarise"), "summary");
  assert.equal(quickActionMode("flashcards"), "flashcards");
  assert.equal(quickActionMode("explain"), "explain");
  assert.equal(quickActionMode("quiz"), "quiz");
});

test("unknown quick action falls back to normal chat", () => {
  assert.equal(quickActionMode("unrelated"), "chat");
  assert.equal(quickActionMode(undefined), "chat");
  assert.equal(quickActionMode(""), "chat");
});

test("normal chat sends mode chat", () => {
  const payload = buildChatPayload({
    sessionId: "s1",
    documentId: "d1",
    message: "What is photosynthesis?"
  });
  assert.equal(payload.mode, "chat");
});

test("each quick action sends the correct mode in the payload", () => {
  const cases = [
    ["summarise", "summary"],
    ["flashcards", "flashcards"],
    ["explain", "explain"],
    ["quiz", "quiz"]
  ];
  for (const [quickActionId, expected] of cases) {
    const payload = buildChatPayload({
      sessionId: "s1",
      documentId: "d1",
      message: "go",
      includeNotes: true,
      mode: quickActionMode(quickActionId)
    });
    assert.equal(payload.mode, expected, `quick action ${quickActionId} should send ${expected}`);
  }
});

test("payload keeps existing fields and SSE contract intact", () => {
  const payload = buildChatPayload({
    sessionId: "s1",
    documentId: "d1",
    message: "summarise this",
    includeNotes: true,
    mode: "quiz"
  });
  assert.deepEqual(payload, {
    sessionId: "s1",
    documentId: "d1",
    message: "summarise this",
    includeNotes: true,
    mode: "quiz"
  });
  for (const m of CHAT_MODES) {
    assert.equal(buildChatPayload({ sessionId: "s", documentId: "d", message: "x", mode: m }).mode, m);
  }
  assert.equal(buildChatPayload({ sessionId: "s", documentId: "d", message: "x", mode: "bogus" }).mode, "chat");
});