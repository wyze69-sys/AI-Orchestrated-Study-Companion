import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_MODES, normalizeMode, resolveChatMode, modeInstruction } from "./chat-modes.js";

test("CHAT_MODES contains the documented values", () => {
  assert.deepEqual([...CHAT_MODES].sort(), ["chat", "explain", "flashcards", "quiz", "summary"].sort());
});

test("missing mode defaults to chat", () => {
  assert.equal(normalizeMode(undefined), "chat");
  assert.equal(normalizeMode(null), "chat");
  assert.equal(resolveChatMode({}).mode, "chat");
  assert.equal(resolveChatMode(undefined).mode, "chat");
  assert.equal(resolveChatMode(null).mode, "chat");
});

test("invalid mode defaults to chat", () => {
  for (const bad of ["", "  ", "summaryy", "QUIZ", "flash card", "multiple-choice", 42, {}, ["quiz"]]) {
    assert.equal(normalizeMode(bad), "chat", `normalizeMode(${JSON.stringify(bad)}) should be chat`);
  }
});

test("each valid mode is accepted as-is", () => {
  for (const m of CHAT_MODES) {
    assert.equal(normalizeMode(m), m);
    assert.equal(resolveChatMode({ mode: m }).mode, m);
  }
});

test("resolveChatMode exposes correct mode flags", () => {
  assert.deepEqual(resolveChatMode({ mode: "quiz" }), { mode: "quiz", isQuiz: true, isFlashcard: false, isSummary: false });
  assert.deepEqual(resolveChatMode({ mode: "flashcards" }), { mode: "flashcards", isQuiz: false, isFlashcard: true, isSummary: false });
  assert.deepEqual(resolveChatMode({ mode: "summary" }), { mode: "summary", isQuiz: false, isFlashcard: false, isSummary: true });
  assert.deepEqual(resolveChatMode({ mode: "explain" }), { mode: "explain", isQuiz: false, isFlashcard: false, isSummary: true });
  assert.deepEqual(resolveChatMode({ mode: "chat" }), { mode: "chat", isQuiz: false, isFlashcard: false, isSummary: false });
});

test("each valid mode selects the correct instruction", () => {
  const instructions = {};
  for (const m of CHAT_MODES) {
    const text = modeInstruction(m);
    assert.equal(typeof text, "string");
    assert.ok(text.length > 0, `instruction for ${m} should not be empty`);
    instructions[m] = text;
  }
  assert.match(instructions.quiz, /multiple choice quiz/i);
  assert.match(instructions.flashcards, /flashcard/i);
  assert.match(instructions.summary, /summary/i);
  assert.match(instructions.explain, /beginner|plain/i);
  assert.match(instructions.chat, /answer/i);
});

test("instructions differ per mode", () => {
  const texts = CHAT_MODES.map((m) => modeInstruction(m));
  assert.equal(new Set(texts).size, CHAT_MODES.length, "each mode should have a distinct instruction");
});

test("chat instruction is used for any invalid input", () => {
  assert.equal(modeInstruction("nonsense"), modeInstruction("chat"));
});