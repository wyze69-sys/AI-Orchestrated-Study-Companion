export const CHAT_MODES = ["chat", "summary", "explain", "quiz", "flashcards"];

export function normalizeMode(value) {
  if (CHAT_MODES.includes(value)) return value;
  return "chat";
}

export function resolveChatMode(body) {
  const mode = normalizeMode(body?.mode);
  return {
    mode,
    isQuiz: mode === "quiz",
    isFlashcard: mode === "flashcards",
    isSummary: mode === "summary" || mode === "explain"
  };
}

export function modeInstruction(mode) {
  switch (mode) {
    case "quiz":
      return 'TASK MODE: Generate a 5-question multiple choice quiz. Provide the output as a JSON object inside ```json ... ``` with schema: {"questions": [{"id": 1, "question": "...", "options": [{"id": "A", "text": "..."}, {"id": "B", "text": "..."}, {"id": "C", "text": "..."}, {"id": "D", "text": "..."}], "correctAnswer": "A", "explanation": "..."}]}';
    case "flashcards":
      return 'TASK MODE: Generate exactly 5 flashcards from the material. Return ONLY a JSON object inside ```json ... ``` with this exact schema: {"flashcards": [{"id": 1, "front": "question or term", "back": "answer or definition", "explanation": "optional extra context", "citation": {"quote": "optional verbatim quote from source", "startLine": 1}}]}. Every field except explanation and citation is required. Use concise, clear language.';
    case "summary":
      return "TASK MODE: Provide a clean, direct summary of the key points from the material. DO NOT generate quiz questions.";
    case "explain":
      return "TASK MODE: Explain the core concepts from the material in plain, simple language for a beginner. DO NOT generate quiz questions.";
    default:
      return "TASK MODE: Answer the user's question directly using the material. DO NOT generate a quiz or multiple-choice questions unless explicitly asked.";
  }
}