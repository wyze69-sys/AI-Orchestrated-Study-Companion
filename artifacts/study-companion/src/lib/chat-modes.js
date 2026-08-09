export const CHAT_MODES = ["chat", "summary", "explain", "quiz", "flashcards"];

export const QUICK_ACTION_MODES = {
  summarise: "summary",
  flashcards: "flashcards",
  explain: "explain",
  quiz: "quiz"
};

export function quickActionMode(actionId) {
  return QUICK_ACTION_MODES[actionId] ?? "chat";
}

export function buildChatPayload({ sessionId, documentId, message, includeNotes = false, mode = "chat" }) {
  const safeMode = CHAT_MODES.includes(mode) ? mode : "chat";
  return {
    sessionId,
    documentId,
    message,
    includeNotes,
    mode: safeMode
  };
}