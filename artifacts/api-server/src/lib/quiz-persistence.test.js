import { test } from "node:test";
import assert from "node:assert/strict";
import { validateQuizResultInput } from "./quiz-persistence.js";

test("validateQuizResultInput accepts valid quiz completion result", () => {
  const input = {
    quizId: "quiz-101",
    totalQuestions: 5,
    score: 4,
    percentage: 80,
    answerState: { 1: "A", 2: "B", 3: "C", 4: "D", 5: "A" }
  };
  const res = validateQuizResultInput(input);
  assert.equal(res.isValid, true);
  assert.equal(res.error, null);
});

test("validateQuizResultInput rejects missing or empty quizId", () => {
  assert.equal(validateQuizResultInput(null).isValid, false);
  assert.equal(validateQuizResultInput({}).isValid, false);
  assert.equal(validateQuizResultInput({ quizId: "" }).isValid, false);
  assert.equal(validateQuizResultInput({ quizId: "   " }).isValid, false);
});

test("validateQuizResultInput rejects invalid totalQuestions", () => {
  const base = { quizId: "q1", score: 0, percentage: 0, answerState: {} };
  assert.equal(validateQuizResultInput({ ...base, totalQuestions: 0 }).isValid, false);
  assert.equal(validateQuizResultInput({ ...base, totalQuestions: -3 }).isValid, false);
  assert.equal(validateQuizResultInput({ ...base, totalQuestions: 3.5 }).isValid, false);
});

test("validateQuizResultInput rejects score out of range or not an integer", () => {
  const base = { quizId: "q1", totalQuestions: 5, percentage: 80, answerState: {} };
  assert.equal(validateQuizResultInput({ ...base, score: -1 }).isValid, false);
  assert.equal(validateQuizResultInput({ ...base, score: 6 }).isValid, false);
  assert.equal(validateQuizResultInput({ ...base, score: "five" }).isValid, false);
});

test("validateQuizResultInput rejects percentage out of range", () => {
  const base = { quizId: "q1", totalQuestions: 5, score: 3, answerState: {} };
  assert.equal(validateQuizResultInput({ ...base, percentage: -10 }).isValid, false);
  assert.equal(validateQuizResultInput({ ...base, percentage: 105 }).isValid, false);
});

test("validateQuizResultInput rejects missing or non-object answerState", () => {
  const base = { quizId: "q1", totalQuestions: 5, score: 3, percentage: 60 };
  assert.equal(validateQuizResultInput({ ...base, answerState: null }).isValid, false);
  assert.equal(validateQuizResultInput({ ...base, answerState: "A" }).isValid, false);
  assert.equal(validateQuizResultInput({ ...base, answerState: [1, 2] }).isValid, false);
});

test("validateQuizResultInput rejects percentage inconsistent with score/total", () => {
  const base = { quizId: "q1", totalQuestions: 5, score: 4, answerState: { 1: "A" } };
  assert.equal(validateQuizResultInput({ ...base, percentage: 50 }).isValid, false);
  assert.equal(validateQuizResultInput({ ...base, percentage: 100 }).isValid, false);
  // Within ±1 rounding tolerance
  assert.equal(validateQuizResultInput({ ...base, percentage: 80 }).isValid, true);
});

test("validateQuizResultInput rejects empty answerState", () => {
  const base = { quizId: "q1", totalQuestions: 5, score: 0, percentage: 0 };
  assert.equal(validateQuizResultInput({ ...base, answerState: {} }).isValid, false);
});

test("validateQuizResultInput rejects oversized quizId, totals, and answerState", () => {
  const base = { quizId: "q1", totalQuestions: 5, score: 3, percentage: 60, answerState: { 1: "A" } };
  assert.equal(validateQuizResultInput({ ...base, quizId: "x".repeat(129) }).isValid, false);
  assert.equal(validateQuizResultInput({ ...base, totalQuestions: 201, score: 0, percentage: 0, answerState: { 1: "A" } }).isValid, false);

  const manyAnswers = {};
  for (let i = 0; i < 201; i++) manyAnswers[i] = "A";
  assert.equal(validateQuizResultInput({ ...base, totalQuestions: 201, score: 0, percentage: 0, answerState: manyAnswers }).isValid, false);

  assert.equal(validateQuizResultInput({ ...base, answerState: { long: "x".repeat(65) } }).isValid, false);
  assert.equal(validateQuizResultInput({ ...base, answerState: { 1: "x".repeat(17) } }).isValid, false);
});
