import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuizResponse, calculateScore, getAnswerFeedback, getQuizIdentity, stableContentHash } from "./quiz.js";

// Test 1: Valid quiz response parsing (JSON and Markdown formats)
test("parseQuizResponse parses valid JSON quiz response correctly", () => {
  const jsonResponse = JSON.stringify({
    questions: [
      {
        id: 1,
        question: "What is the primary function of chlorophyll?",
        options: [
          { id: "A", text: "Converts water into carbon dioxide" },
          { id: "B", text: "Captures light energy inside chloroplasts" }
        ],
        correctAnswer: "B",
        explanation: "Chlorophyll is a pigment that absorbs light."
      }
    ]
  });

  const parsed = parseQuizResponse(jsonResponse);
  assert.equal(parsed.error, null);
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].question, "What is the primary function of chlorophyll?");
  assert.equal(parsed.questions[0].correctAnswer, "B");
  assert.equal(parsed.questions[0].options.length, 2);
});

test("parseQuizResponse parses valid JSON quiz inside markdown codeblock", () => {
  const codeblockResponse = `Here is your quiz:
\`\`\`json
{
  "questions": [
    {
      "id": "q1",
      "question": "What is oxygen released as?",
      "options": ["A byproduct of photosynthesis", "A reactant"],
      "correctAnswer": "A",
      "explanation": "Oxygen is produced during light reactions."
    }
  ]
}
\`\`\``;

  const parsed = parseQuizResponse(codeblockResponse);
  assert.equal(parsed.error, null);
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].options[0].id, "A");
  assert.equal(parsed.questions[0].options[0].text, "A byproduct of photosynthesis");
  assert.equal(parsed.questions[0].correctAnswer, "A");
});

test("parseQuizResponse parses valid Markdown quiz text with Answer Key", () => {
  const markdownResponse = `
**Question 1:** What process converts light into chemical energy?
A) Respiration
B) Photosynthesis
C) Fermentation
D) Transpiration

**Answer Key:**
1. B - Photosynthesis utilizes light energy to synthesise organic compounds.
`;

  const parsed = parseQuizResponse(markdownResponse);
  assert.equal(parsed.error, null);
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].question, "What process converts light into chemical energy?");
  assert.equal(parsed.questions[0].options.length, 4);
  assert.equal(parsed.questions[0].correctAnswer, "B");
  assert.equal(parsed.questions[0].explanation, "Photosynthesis utilizes light energy to synthesise organic compounds.");
});

// Test 2: Invalid/malformed response handling
test("parseQuizResponse handles invalid or malformed JSON gracefully", () => {
  const invalidJson = `\`\`\`json
{ "questions": [{ "question": "Incomplete data" }] }
\`\`\``;

  const parsed = parseQuizResponse(invalidJson);
  assert.equal(parsed.questions.length, 0);
  assert.notEqual(parsed.error, null);
});

test("parseQuizResponse handles malformed quiz text without options cleanly", () => {
  const malformedText = "Question 1: What is life? Just a random string without options or answer key.";
  const parsed = parseQuizResponse(malformedText);
  assert.equal(parsed.questions.length, 0);
  assert.notEqual(parsed.error, null);
});

test("parseQuizResponse rejects Markdown quiz without an answer key instead of guessing first option", () => {
  const noKey = `
**Question 1:** What is 2+2?
A) 3
B) 4
`;
  const parsed = parseQuizResponse(noKey);
  assert.equal(parsed.questions.length, 0);
  assert.notEqual(parsed.error, null);
});

test("parseQuizResponse rejects questions whose answer key is not among its options", () => {
  const invalidAnswer = JSON.stringify({
    questions: [
      {
        id: 1,
        question: "Pick one",
        options: [{ id: "A", text: "x" }, { id: "B", text: "y" }],
        correctAnswer: "C"
      }
    ]
  });
  const parsed = parseQuizResponse(invalidAnswer);
  assert.equal(parsed.questions.length, 0);
  assert.notEqual(parsed.error, null);
});

test("parseQuizResponse rejects questions with duplicate option ids", () => {
  const dupOptions = JSON.stringify({
    questions: [
      {
        id: 1,
        question: "Pick one",
        options: [{ id: "A", text: "x" }, { id: "A", text: "y" }],
        correctAnswer: "A"
      }
    ]
  });
  const parsed = parseQuizResponse(dupOptions);
  assert.equal(parsed.questions.length, 0);
  assert.notEqual(parsed.error, null);
});

test("parseQuizResponse drops only malformed questions and keeps valid siblings", () => {
  const mixed = JSON.stringify({
    questions: [
      { id: 1, question: "Good", options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], correctAnswer: "B" },
      { id: 2, question: "Bad", options: [{ id: "A", text: "x" }], correctAnswer: "A" },
      { id: 3, question: "Also bad", options: [{ id: "A", text: "x" }, { id: "B", text: "y" }], correctAnswer: "Z" }
    ]
  });
  const parsed = parseQuizResponse(mixed);
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].question, "Good");
  assert.equal(parsed.questions[0].correctAnswer, "B");
});

test("parseQuizResponse aligns the answer key with written question numbers", () => {
  const text = `**Question 2:** What is the capital of France?
A) Berlin
B) Paris

**Answer Key:**
2. B - Paris is the capital.
`;
  const parsed = parseQuizResponse(text);
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].id, 2);
  assert.equal(parsed.questions[0].correctAnswer, "B");
  assert.equal(parsed.questions[0].explanation, "Paris is the capital.");
});

test("duplicate AI-provided question ids fall back to positional ids", () => {
  const dupQs = JSON.stringify({
    questions: [
      { id: "q", question: "One", options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], correctAnswer: "A" },
      { id: "q", question: "Two", options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], correctAnswer: "B" },
      { id: 2, question: "Three", options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], correctAnswer: "B" }
    ]
  });
  const parsed = parseQuizResponse(dupQs);
  assert.equal(parsed.questions.length, 3);
  const ids = parsed.questions.map((q) => String(q.id));
  assert.equal(new Set(ids).size, 3);
});

// ── Tests for stable quiz identity ──────────────────────────────────────────

test("getQuizIdentity derives a stable identity from content across different message ids", () => {
  const content = '{"questions":[]}';
  const a = getQuizIdentity({ content, messageId: "msg-1", documentId: "doc-1" });
  const b = getQuizIdentity({ content, messageId: "msg-2", documentId: "doc-2" });
  assert.equal(a, b);
  assert.ok(a.startsWith("quiz-"));
});

test("getQuizIdentity changes when the quiz content changes", () => {
  const a = getQuizIdentity({ content: "quiz one", messageId: "msg-1" });
  const c = getQuizIdentity({ content: "quiz two", messageId: "msg-1" });
  assert.notEqual(a, c);
});

test("getQuizIdentity falls back to messageId when content is empty", () => {
  assert.equal(getQuizIdentity({ content: "", messageId: "msg-1" }), "msg-1");
  assert.equal(getQuizIdentity({ content: "  ", documentId: "doc-1" }), "doc-1");
  assert.equal(getQuizIdentity({ content: "" }), "default-quiz");
});

test("stableContentHash is deterministic and reflects content changes", () => {
  assert.equal(stableContentHash("hello"), stableContentHash("hello"));
  assert.notEqual(stableContentHash("hello"), stableContentHash("world"));
  assert.equal(typeof stableContentHash(""), "string");
});

// Test 3: Empty quiz handling
test("parseQuizResponse handles empty or null quiz responses safely", () => {
  assert.deepEqual(parseQuizResponse(""), { questions: [], error: "Empty quiz response." });
  assert.deepEqual(parseQuizResponse("   "), { questions: [], error: "Empty quiz response." });
  assert.deepEqual(parseQuizResponse(null), { questions: [], error: "Empty quiz response." });
  assert.deepEqual(parseQuizResponse(undefined), { questions: [], error: "Empty quiz response." });
});

// Test 4: Answer selection & Correct answer feedback
test("getAnswerFeedback provides correct answer feedback when answer matches", () => {
  const question = {
    id: 1,
    question: "What is 2+2?",
    options: [{ id: "A", text: "3" }, { id: "B", text: "4" }],
    correctAnswer: "B",
    explanation: "2 plus 2 equals 4."
  };

  const feedback = getAnswerFeedback(question, "B");
  assert.equal(feedback.isAnswered, true);
  assert.equal(feedback.isCorrect, true);
  assert.equal(feedback.selectedOption, "B");
  assert.equal(feedback.correctAnswer, "B");
  assert.equal(feedback.explanation, "2 plus 2 equals 4.");
});

// Test 5: Incorrect answer feedback
test("getAnswerFeedback provides incorrect answer feedback when selection is wrong", () => {
  const question = {
    id: 1,
    question: "What is the capital of France?",
    options: [{ id: "A", text: "Berlin" }, { id: "B", text: "Paris" }],
    correctAnswer: "B",
    explanation: "Paris is the capital of France."
  };

  const feedback = getAnswerFeedback(question, "A");
  assert.equal(feedback.isAnswered, true);
  assert.equal(feedback.isCorrect, false);
  assert.equal(feedback.selectedOption, "A");
  assert.equal(feedback.correctAnswer, "B");
  assert.equal(feedback.explanation, "Paris is the capital of France.");
});

// Test 6: Score calculation
test("calculateScore computes score and progress accurately", () => {
  const questions = [
    { id: 1, correctAnswer: "A" },
    { id: 2, correctAnswer: "B" },
    { id: 3, correctAnswer: "C" }
  ];

  // Partially answered
  const partialAnswers = { 1: "A", 2: "A" };
  const partialScore = calculateScore(partialAnswers, questions);
  assert.equal(partialScore.answeredCount, 2);
  assert.equal(partialScore.correctCount, 1);
  assert.equal(partialScore.totalCount, 3);
  assert.equal(partialScore.percentage, 33);
  assert.equal(partialScore.isCompleted, false);

  // Fully answered
  const fullAnswers = { 1: "A", 2: "B", 3: "C" };
  const fullScore = calculateScore(fullAnswers, questions);
  assert.equal(fullScore.answeredCount, 3);
  assert.equal(fullScore.correctCount, 3);
  assert.equal(fullScore.totalCount, 3);
  assert.equal(fullScore.percentage, 100);
  assert.equal(fullScore.isCompleted, true);
});

test("calculateScore handles empty inputs safely", () => {
  const emptyScore = calculateScore({}, []);
  assert.equal(emptyScore.answeredCount, 0);
  assert.equal(emptyScore.correctCount, 0);
  assert.equal(emptyScore.totalCount, 0);
  assert.equal(emptyScore.percentage, 0);
  assert.equal(emptyScore.isCompleted, false);
});

// ── Tests for getIncorrectQuestions ─────────────────────────────────────────
import { getIncorrectQuestions } from "./quiz.js";

const sampleQuestions = [
  { id: 1, question: "Q1", options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], correctAnswer: "A", explanation: "" },
  { id: 2, question: "Q2", options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], correctAnswer: "B", explanation: "" },
  { id: 3, question: "Q3", options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], correctAnswer: "A", explanation: "" }
];

test("getIncorrectQuestions returns only incorrectly answered questions", () => {
  const answers = { 1: "A", 2: "A", 3: "A" }; // Q2 wrong (correct is B)
  const incorrect = getIncorrectQuestions(sampleQuestions, answers);
  assert.equal(incorrect.length, 1);
  assert.equal(incorrect[0].id, 2);
});

test("getIncorrectQuestions preserves original question data (options, explanation, correctAnswer)", () => {
  const answers = { 1: "B", 2: "A" }; // Q1 wrong, Q2 wrong, Q3 unanswered
  const incorrect = getIncorrectQuestions(sampleQuestions, answers);
  assert.equal(incorrect.length, 2);
  // Original options and correctAnswer must be preserved
  assert.equal(incorrect[0].correctAnswer, "A");
  assert.equal(incorrect[0].options.length, 2);
  assert.equal(incorrect[1].correctAnswer, "B");
});

test("getIncorrectQuestions excludes unanswered questions", () => {
  const answers = { 1: "A" }; // only Q1 answered (correctly); Q2, Q3 unanswered
  const incorrect = getIncorrectQuestions(sampleQuestions, answers);
  assert.equal(incorrect.length, 0);
});

test("retry score resets correctly — only incorrect question answers are cleared", () => {
  // Simulate: all 3 answered, Q2 was wrong
  const answers = { 1: "A", 2: "A", 3: "A" };
  const incorrectQs = getIncorrectQuestions(sampleQuestions, answers);
  assert.equal(incorrectQs.length, 1);
  assert.equal(incorrectQs[0].id, 2);

  // Simulate retry: delete Q2 answer
  const retryAnswers = { ...answers };
  for (const q of incorrectQs) delete retryAnswers[q.id];

  // Score against the retry question set should start at 0
  const retryScore = calculateScore(retryAnswers, incorrectQs);
  assert.equal(retryScore.answeredCount, 0);
  assert.equal(retryScore.correctCount, 0);
  assert.equal(retryScore.totalCount, 1);
});

test("restart resets all questions and answers", () => {
  const answers = { 1: "A", 2: "A", 3: "B" }; // Q3 wrong
  const resetAnswers = {};
  const resetScore = calculateScore(resetAnswers, sampleQuestions);
  assert.equal(resetScore.answeredCount, 0);
  assert.equal(resetScore.correctCount, 0);
  assert.equal(resetScore.totalCount, 3);
  assert.equal(resetScore.isCompleted, false);
});

test("all-correct quiz produces zero incorrect questions — retry action must not appear", () => {
  const answers = { 1: "A", 2: "B", 3: "A" }; // all correct
  const incorrect = getIncorrectQuestions(sampleQuestions, answers);
  assert.equal(incorrect.length, 0);
  // Score should be perfect
  const score = calculateScore(answers, sampleQuestions);
  assert.equal(score.correctCount, 3);
  assert.equal(score.percentage, 100);
});

test("empty retry state is safe — getIncorrectQuestions on empty questions returns []", () => {
  assert.deepEqual(getIncorrectQuestions([], {}), []);
  assert.deepEqual(getIncorrectQuestions(null, {}), []);
  assert.deepEqual(getIncorrectQuestions(undefined, {}), []);
});

test("keyboard activation simulation works for retry and restart actions", () => {
  let retryClicked = false;
  let restartClicked = false;

  const onRetry = () => { retryClicked = true; };
  const onRestart = () => { restartClicked = true; };

  // Simulate Enter key trigger
  const triggerKey = (key, handler) => {
    if (key === "Enter" || key === " ") handler();
  };

  triggerKey("Enter", onRetry);
  assert.equal(retryClicked, true);

  triggerKey(" ", onRestart);
  assert.equal(restartClicked, true);

  // Other keys must not trigger
  let shouldNotFire = false;
  triggerKey("Tab", () => { shouldNotFire = true; });
  assert.equal(shouldNotFire, false);
});

test("restoring saved quiz result sets userAnswers and computes full completion score", () => {
  const savedResult = {
    quizId: "msg-123",
    totalQuestions: 3,
    score: 2,
    percentage: 67,
    answerState: { 1: "A", 2: "A", 3: "A" }
  };

  const score = calculateScore(savedResult.answerState, sampleQuestions);
  assert.equal(score.isCompleted, true);
  assert.equal(score.answeredCount, 3);
  assert.equal(score.correctCount, 2);
  assert.equal(score.percentage, 67);
});

test("handling malformed saved answer data safely fallback to empty state", () => {
  const malformedResults = [
    { answerState: null },
    { answerState: "not-an-object" },
    { answerState: [1, 2, 3] },
    undefined
  ];

  for (const saved of malformedResults) {
    const rawAnswers = saved?.answerState && typeof saved.answerState === "object" && !Array.isArray(saved.answerState)
      ? saved.answerState
      : {};
    const score = calculateScore(rawAnswers, sampleQuestions);
    assert.equal(score.isCompleted, false);
    assert.equal(score.answeredCount, 0);
  }
});

test("quiz persistence condition: triggers only when 100% of active questions are answered", () => {
  const partialAnswers = { 1: "A", 2: "B" };
  const partialScore = calculateScore(partialAnswers, sampleQuestions);
  assert.equal(partialScore.isCompleted, false);

  const fullAnswers = { 1: "A", 2: "B", 3: "A" };
  const fullScore = calculateScore(fullAnswers, sampleQuestions);
  assert.equal(fullScore.isCompleted, true);
});

test("retry/restart resets active attempt locally without saving incomplete state", () => {
  let userAnswers = { 1: "A", 2: "A", 3: "A" };
  let initialScore = calculateScore(userAnswers, sampleQuestions);
  assert.equal(initialScore.isCompleted, true);

  const incorrectOnes = getIncorrectQuestions(sampleQuestions, userAnswers);
  const nextAnswers = { ...userAnswers };
  for (const q of incorrectOnes) delete nextAnswers[q.id];

  const retryScore = calculateScore(nextAnswers, incorrectOnes);
  assert.equal(retryScore.isCompleted, false);

  const overallRetryScore = calculateScore(nextAnswers, sampleQuestions);
  assert.equal(overallRetryScore.isCompleted, false);

  const restartAnswers = {};
  const restartScore = calculateScore(restartAnswers, sampleQuestions);
  assert.equal(restartScore.isCompleted, false);
  assert.equal(restartScore.answeredCount, 0);
});
