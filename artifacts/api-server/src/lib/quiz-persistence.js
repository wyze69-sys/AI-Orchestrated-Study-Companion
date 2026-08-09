/**
 * Validation and database operations for Quiz Results persistence.
 */

export function validateQuizResultInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { isValid: false, error: "Request body must be a JSON object" };
  }

  const { quizId, totalQuestions, score, percentage, answerState } = body;

  if (quizId == null || String(quizId).trim() === "") {
    return { isValid: false, error: "quizId is required and must be a non-empty string" };
  }
  if (String(quizId).length > 128) {
    return { isValid: false, error: "quizId must not exceed 128 characters" };
  }

  const total = Number(totalQuestions);
  if (!Number.isInteger(total) || total <= 0) {
    return { isValid: false, error: "totalQuestions must be a positive integer greater than zero" };
  }
  if (total > 200) {
    return { isValid: false, error: "totalQuestions must not exceed 200" };
  }

  const sc = Number(score);
  if (!Number.isInteger(sc) || sc < 0 || sc > total) {
    return { isValid: false, error: `score must be an integer between 0 and totalQuestions (${total})` };
  }

  const pct = Number(percentage);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    return { isValid: false, error: "percentage must be an integer between 0 and 100" };
  }

  // Percentage must be consistent with score/total. The web client computes
  // Math.round(...), so a tolerance of ±1 absorbs rounding differences
  // without accepting arbitrary client-provided percentages.
  const expectedPct = Math.round((sc / total) * 100);
  if (Math.abs(pct - expectedPct) > 1) {
    return { isValid: false, error: `percentage (${pct}) is inconsistent with score/totalQuestions (expected ${expectedPct})` };
  }

  if (answerState == null || typeof answerState !== "object" || Array.isArray(answerState)) {
    return { isValid: false, error: "answerState must be an object map of questionId to selected choice" };
  }

  const keys = Object.keys(answerState);
  if (keys.length === 0) {
    return { isValid: false, error: "answerState must contain at least one answered question" };
  }
  if (keys.length > 200) {
    return { isValid: false, error: "answerState must not exceed 200 answered questions" };
  }
  for (const key of keys) {
    if (String(key).length > 64) {
      return { isValid: false, error: "answerState keys must not exceed 64 characters" };
    }
    const value = answerState[key];
    if (typeof value !== "string" || value.length > 16) {
      return { isValid: false, error: "answerState values must be short strings" };
    }
  }

  return { isValid: true, error: null };
}
