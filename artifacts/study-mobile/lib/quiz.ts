export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: number | string;
  question: string;
  options: QuizOption[];
  correctAnswer: string;
  explanation: string;
}

export interface QuizParseResult {
  questions: QuizQuestion[];
  error: string | null;
}

export interface QuizScore {
  answeredCount: number;
  correctCount: number;
  totalCount: number;
  percentage: number;
  isCompleted: boolean;
}

export interface AnswerFeedback {
  isAnswered: boolean;
  isCorrect: boolean;
  selectedOption: string | null;
  correctAnswer: string;
  explanation: string;
}

/**
 * Deterministic FNV-1a hash producing a stable short string identity
 * for a given quiz content string. Used so a quiz has the same identity
 * before and after a page reload / session reload.
 */
export function stableContentHash(input: unknown): string {
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
export function getQuizIdentity(input: {
  content?: string;
  messageId?: string | null;
  documentId?: string | null;
}): string {
  const contentKey = String(input.content ?? "").trim();
  if (contentKey) {
    return `quiz-${stableContentHash(contentKey)}`;
  }
  return input.messageId || input.documentId || "default-quiz";
}

/** Normalizes options into standard format: [{ id: "A", text: "..." }, ...] */
function normalizeOptions(options: unknown): QuizOption[] {
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
        const rawId = String((opt as any).id || (opt as any).key || "").trim();
        const id = rawId ? rawId.toUpperCase() : String.fromCharCode(65 + idx);
        const text = String((opt as any).text || (opt as any).label || (opt as any).value || "").trim();
        if (id && text) return { id, text };
      }
      return null;
    })
    .filter((x): x is QuizOption => x !== null);
}

function hasValidOptionIds(options: QuizOption[]): boolean {
  const seen = new Set<string>();
  for (const opt of options) {
    if (!opt || typeof opt !== "object" || !opt.id) return false;
    if (seen.has(opt.id)) return false;
    seen.add(opt.id);
  }
  return true;
}

function normalizeJsonQuestion(q: unknown, fallbackIndex: number): Pick<QuizQuestion, "question" | "options" | "correctAnswer" | "explanation"> | null {
  if (!q || typeof q !== "object") return null;
  const record = q as Record<string, unknown>;
  const questionText = String(record.question || record.text || record.prompt || "").trim();
  const options = normalizeOptions(record.options || record.choices || record.answers);
  const correctAnswer = String(record.correctAnswer || record.answer || record.key || "").trim().toUpperCase();
  const explanation = String(record.explanation || record.reason || "").trim();

  if (!questionText || options.length < 2 || !correctAnswer) return null;
  if (!hasValidOptionIds(options)) return null;

  const optionIds = new Set(options.map((o) => o.id));
  if (!optionIds.has(correctAnswer)) return null;

  return {
    question: questionText,
    options,
    correctAnswer,
    explanation
  };
}

/**
 * Parses raw AI response text into a structured quiz object.
 * Supports both JSON format (codeblock or raw object) and Markdown text format.
 */
export function parseQuizResponse(rawText: unknown): QuizParseResult {
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
        const usedQuestionIds = new Set<string>();
        const validQuestions = rawQuestions
          .map((q: unknown, i: number) => {
            const normalized = normalizeJsonQuestion(q, i);
            if (!normalized) return null;
            const rawQ = q as Record<string, unknown> | null;

            let qid = rawQ && rawQ.id != null ? rawQ.id : i + 1;
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
    const questions: QuizQuestion[] = [];
    const answerKeyMap = new Map<number, { answer: string; explanation: string }>();

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

    if (hasAnswerKeySection && answerKeyMap.size === 0) {
      return { questions: [], error: "Invalid or malformed quiz format returned by AI." };
    }

    const qBlocks = text.split(/(?=(?:\*\*|\#\#?\s*)?Question\s*\d+|\b\d+\.\s+[A-Z])/i);

    for (const block of qBlocks) {
      const qTextMatch = block.match(/(?:\*\*|\#\#?\s*)?(?:Question\s*\d+|[\d]+)\s*[.:-]?\s*\**([^\n]+)/i);
      if (!qTextMatch) continue;

      const questionText = qTextMatch[1].replace(/\*\*/g, "").trim();
      if (!questionText) continue;

      const qNumberMatch = block.match(/^\s*(?:\*\*|\#\#?\s*)?(?:Question\s*)?(\d+)/i);
      const qNumber = qNumberMatch ? parseInt(qNumberMatch[1], 10) : null;

      const optionMatches = [...block.matchAll(/(?:^|\n)\s*([A-D])[\s.)\-]+([^\n]+)/gi)];
      const options = optionMatches.map((m) => ({
        id: m[1].toUpperCase(),
        text: m[2].replace(/\*\*/g, "").trim()
      }));

      if (options.length < 2 || !hasValidOptionIds(options)) continue;

      const keyData = qNumber != null ? answerKeyMap.get(qNumber) : null;
      if (!keyData || !keyData.answer) continue;
      if (!new Set(options.map((o) => o.id)).has(keyData.answer)) continue;

      questions.push({
        id: qNumber as number,
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
 */
export function calculateScore(userAnswers: Record<string | number, string>, questions: QuizQuestion[]): QuizScore {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { answeredCount: 0, correctCount: 0, totalCount: 0, percentage: 0, isCompleted: false };
  }

  let correctCount = 0;
  let answeredCount = 0;

  for (const q of questions) {
    if (!q || q.id == null) continue;
    const selected = userAnswers[q.id as keyof typeof userAnswers];
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
 */
export function getAnswerFeedback(question: QuizQuestion | null | undefined, selectedOptionId: string | null): AnswerFeedback {
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
 * original question object. Unanswered questions are excluded.
 */
export function getIncorrectQuestions(questions: QuizQuestion[] | null | undefined, userAnswers: Record<string, string> = {}): QuizQuestion[] {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  return questions.filter((q) => {
    if (!q || q.id == null) return false;
    const selected = userAnswers[String(q.id)];
    if (selected == null) return false;
    return String(selected).toUpperCase() !== String(q.correctAnswer || "").toUpperCase();
  });
}