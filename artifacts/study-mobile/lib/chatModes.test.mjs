import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_MODE_CHAT,
  CHAT_MODES,
  normalizeChatMode,
  QUICK_ACTION_MODES,
  quickActionToMode,
} from "./chatModes.ts";

test("mobile normal chat sends the chat mode", () => {
  assert.equal(CHAT_MODE_CHAT, "chat");
  const payload = { mode: CHAT_MODE_CHAT, message: "hello" };
  assert.equal(payload.mode, "chat");
});

test("missing mode defaults to chat", () => {
  assert.equal(normalizeChatMode(undefined), CHAT_MODE_CHAT);
  assert.equal(normalizeChatMode(null), CHAT_MODE_CHAT);
  assert.equal(normalizeChatMode(""), CHAT_MODE_CHAT);
});

test("invalid mode defaults to chat", () => {
  for (const bad of ["quizzen", "QUIZ", "flashcardss", 1, true, {}, [], " "]) {
    assert.equal(normalizeChatMode(bad), CHAT_MODE_CHAT, `normalizeChatMode(${JSON.stringify(bad)})`);
  }
});

test("valid modes are accepted as-is", () => {
  for (const mode of CHAT_MODES) {
    assert.equal(normalizeChatMode(mode), mode);
  }
});

test("quick actions map to the documented modes", () => {
  assert.equal(quickActionToMode("summarise"), "summary");
  assert.equal(quickActionToMode("flashcards"), "flashcards");
  assert.equal(quickActionToMode("explain"), "explain");
  assert.equal(quickActionToMode("quiz"), "quiz");
  assert.equal(quickActionToMode("unknown"), CHAT_MODE_CHAT);
  assert.equal(quickActionToMode(undefined), CHAT_MODE_CHAT);
  assert.deepEqual(QUICK_ACTION_MODES, {
    summarise: "summary",
    flashcards: "flashcards",
    explain: "explain",
    quiz: "quiz",
  });
});