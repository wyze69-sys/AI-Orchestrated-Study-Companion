/**
 * Utility functions for parsing, validating, scoring, and managing interactive quizzes.
 */

/**
 * Deterministic FNV-1a hash producing a stable short string identity
 * for a given quiz content string. Used so a quiz has the same identity
 * before and after a page reload / session reload (the persisted message
 * has a different UUID than the in-memory message).
 */
export function stableContentHash(input) {
  let h = 2166136261;
  const str = String(input ?? "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Stable quiz identity derived from message content + source ids.
 * Falls back to messageId/documentId when content is empty.
 */
export function getQuizIdentity({ content, messageId, documentId }) {
  const contentKey = String(content ?? "").trim();
  if (contentKey) {
    return `quiz-${stableContentHash(contentKey)}`;
  }
  return messageId || documentId || "default-quiz";
}

/**
 * Normalizes options into standard format: [{ id: "A", text: "..." }, { id: "B", text: "..." }]
 */
function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((opt, idx) => {
      if (typeof opt === "string") {
        const text = opt.trim();
        if (!text) return null;
        const key = String.fromCharCode(65 + idx);
        return { id: key, text };
      }
      if (opt && typeof opt === "object") {
        const rawId = String(opt.id || opt.key || "").trim();
        const id = rawId ? rawId.toUpperCase() : String.fromCharCode(65 + idx);
        const text = String(opt.text || opt.label || opt.value || "").trim();
        if (id && text) return { id, text };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Returns true when every option id is unique and none are empty.
 */
function hasValidOptionIds(options) {
  const seen = new Set();
  for (const opt of options) {
    if (!opt || typeof opt !== "object" || !opt.id) return false;
    if (seen.has(opt.id)) return false;
    seen.add(opt.id);
  }
  return true;
}

/**
 * Constructs a normalized question object from a single JSON question entry,
 * or returns null when the entry is malformed (missing text/options, no
 * valid answer key, duplicate option ids, answer not among the options).
 */
function normalizeJsonQuestion(q, fallbackIndex) {
  if (!q || typeof q !== "object") return null;
  const questionText = String(q.question || q.text || q.prompt || "").trim();
  const options = normalizeOptions(q.options || q.choices || q.answers);
  const correctAnswer = String(q.correctAnswer || q.answer || q.key || "").trim().toUpperCase();
  const explanation = String(q.explanation || q.reason || "").trim();

  if (!questionText || options.length < 2 || !correctAnswer) return null;
  if (!hasValidOptionIds(options)) return null;

  const optionIds = new Set(options.map((o) => o.id));
  if (!optionIds.has(correctAnswer)) return null;

  return {
    id: null, // assigned by caller (defaults to positional index when needed)
    question: questionText,
    options,
    correctAnswer,
    explanation
  };
}

/**
 * Parses raw AI response text into a structured quiz object.
 * Supports both JSON format (codeblock or raw object) and Markdown text format.
 *
 * @param {string} rawText
 * @returns {{ questions: Array<{ id: number|string, question: string, options: Array<{ id: string, text: string }>, correctAnswer: string, explanation: string }>, error: string|null }}
 */
export function parseQuizResponse(rawText) {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return { questions: [], error: "Empty quiz response." };
  }

  const text = rawText.trim();

  // Strategy 1: JSON Parsing (code block or raw object string)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, text];
  const jsonCandidate = (jsonMatch[1] || text).trim();

  if (jsonCandidate.startsWith("{") || jsonCandidate.startsWith("[")) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      const rawQuestions = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.questions)
        ? parsed.questions
        : null;

      if (rawQuestions && rawQuestions.length > 0) {
        const usedQuestionIds = new Set();
        const validQuestions = rawQuestions
          .map((q, i) => {
            const normalized = normalizeJsonQuestion(q, i);
            if (!normalized) return null;

            // Question ids become the answerState keys. Trust the AI-provided
            // id when unique, otherwise fall back to a stable positional id
            // so answers can never clobber each other.
            let qid = q && q.id != null ? q.id : i + 1;
            let key = String(qid);
            if (usedQuestionIds.has(key)) {
              qid = i + 1;
              key = String(qid);
            }
            if (usedQuestionIds.has(key)) {
              key = `${i + 1}:${stableContentHash(normalized.question)}`;
              qid = key;
            }
            usedQuestionIds.add(key);

            return {
              id: qid,
              question: normalized.question,
              options: normalized.options,
              correctAnswer: normalized.correctAnswer,
              explanation: normalized.explanation
            };
          })
          .filter(Boolean);

        if (validQuestions.length > 0) {
          return { questions: validQuestions, error: null };
        }
      }
    } catch {
      // Fall through to Markdown strategy
    }
  }

  // Strategy 2: Markdown Quiz Parsing
  try {
    const questions = [];
    const answerKeyMap = new Map();

    // Only treat a standalone "Answer Key:"-style section (starting on its
    // own line) as the source of correct answers. Without one the quiz is
    // rejected below instead of guessing that the first option is correct.
    let hasAnswerKeySection = false;
    const answerKeySectionMatch = text.match(/^\s*(?:\*\*)?(?:Answer Key|Answers|Key):\s*([\s\S]*)$/im);
    if (answerKeySectionMatch) {
      hasAnswerKeySection = true;
      const keyLines = answerKeySectionMatch[1].split("\n");
      for (const line of keyLines) {
        const keyMatch = line.match(/^\s*(?:Question\s*)?(\d+)[.:)]\s*([A-D])(?:\s*[-–:]\s*(.*))?/i);
        if (keyMatch) {
          const qNum = parseInt(keyMatch[1], 10);
          const ansKey = keyMatch[2].toUpperCase();
          const explanation = (keyMatch[3] || "").trim();
          answerKeyMap.set(qNum, { answer: ansKey, explanation });
        }
      }
    }

    // A section header with no parseable key lines is malformed, not
    // a signal to guess answers.
    if (hasAnswerKeySection && answerKeyMap.size === 0) {
      return { questions: [], error: "Invalid or malformed quiz format returned by AI." };
    }

    // Split text into question blocks
    const qBlocks = text.split(/(?=(?:\*\*|\#\#?\s*)?Question\s*\d+|\b\d+\.\s+[A-Z])/i);

    for (const block of qBlocks) {
      const qTextMatch = block.match(/(?:\*\*|\#\#?\s*)?(?:Question\s*\d+|[\d]+)\s*[.:-]?\s*\**([^\n]+)/i);
      if (!qTextMatch) continue;

      const questionText = qTextMatch[1].replace(/\*\*/g, "").trim();
      if (!questionText) continue;

      // Written question number so the answer key aligns even when some
      // questions were dropped or numbered non-sequentially.
      const qNumberMatch = block.match(/^\s*(?:\*\*|\#\#?\s*)?(?:Question\s*)?(\d+)/i);
      const qNumber = qNumberMatch ? parseInt(qNumberMatch[1], 10) : null;

      const optionMatches = [...block.matchAll(/(?:^|\n)\s*([A-D])[\s.)-]+([^\n]+)/gi)];
      const options = optionMatches.map((m) => ({
        id: m[1].toUpperCase(),
        text: m[2].replace(/\*\*/g, "").trim()
      }));

      if (options.length < 2 || !hasValidOptionIds(options)) continue;

      // Reject questions without a key entry instead of fabricating one.
      const keyData = qNumber != null ? answerKeyMap.get(qNumber) : null;
      if (!keyData || !keyData.answer) continue;
      if (!new Set(options.map((o) => o.id)).has(keyData.answer)) continue;

      questions.push({
        id: qNumber,
        question: questionText,
        options,
        correctAnswer: keyData.answer,
        explanation: keyData.explanation || ""
      });
    }

    if (questions.length > 0) {
      return { questions, error: null };
    }
  } catch {
    // Ignore and fall through to error return
  }

  return { questions: [], error: "Invalid or malformed quiz format returned by AI." };
}

/**
 * Calculates total and percentage score metrics.
 *
 * @param {Record<string|number, string>} userAnswers - Map of question ID to selected choice ID.
 * @param {Array<object>} questions - List of question objects.
 * @returns {{ answeredCount: number, correctCount: number, totalCount: number, percentage: number, isCompleted: boolean }}
 */
export function calculateScore(userAnswers = {}, questions = []) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { answeredCount: 0, correctCount: 0, totalCount: 0, percentage: 0, isCompleted: false };
  }

  let correctCount = 0;
  let answeredCount = 0;

  for (const q of questions) {
    if (!q || q.id == null) continue;
    const selected = userAnswers[q.id];
    if (selected != null) {
      answeredCount++;
      if (String(selected).toUpperCase() === String(q.correctAnswer).toUpperCase()) {
        correctCount++;
      }
    }
  }

  const totalCount = questions.length;
  const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const isCompleted = answeredCount === totalCount && totalCount > 0;

  return {
    answeredCount,
    correctCount,
    totalCount,
    percentage,
    isCompleted
  };
}

/**
 * Evaluates answer choice feedback for a question.
 *
 * @param {object} question
 * @param {string|null} selectedOptionId
 * @returns {{ isAnswered: boolean, isCorrect: boolean, selectedOption: string|null, correctAnswer: string, explanation: string }}
 */
export function getAnswerFeedback(question, selectedOptionId) {
  if (!question || typeof question !== "object") {
    return { isAnswered: false, isCorrect: false, selectedOption: null, correctAnswer: "", explanation: "" };
  }

  if (selectedOptionId == null) {
    return {
      isAnswered: false,
      isCorrect: false,
      selectedOption: null,
      correctAnswer: String(question.correctAnswer || ""),
      explanation: String(question.explanation || "")
    };
  }

  const selected = String(selectedOptionId).toUpperCase();
  const correct = String(question.correctAnswer || "").toUpperCase();
  const isCorrect = selected === correct;

  return {
    isAnswered: true,
    isCorrect,
    selectedOption: selected,
    correctAnswer: correct,
    explanation: String(question.explanation || "")
  };
}

/**
 * Returns only the questions that were answered incorrectly, preserving their
 * original question object (including options, correctAnswer, explanation).
 * Questions that were not answered are excluded (only confirmed wrong answers).
 *
 * @param {Array<object>} questions - Full list of question objects.
 * @param {Record<string|number, string>} userAnswers - Map of question ID → selected option ID.
 * @returns {Array<object>} Subset of questions answered incorrectly.
 */
export function getIncorrectQuestions(questions, userAnswers = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  return questions.filter((q) => {
    if (!q || q.id == null) return false;
    const selected = userAnswers[q.id];
    if (selected == null) return false; // unanswered — not a confirmed wrong answer
    return String(selected).toUpperCase() !== String(q.correctAnswer || "").toUpperCase();
  });
}
