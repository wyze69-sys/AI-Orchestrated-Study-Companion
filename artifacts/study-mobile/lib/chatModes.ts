export const CHAT_MODE_CHAT = "chat";

export const CHAT_MODES: readonly string[] = ["chat", "summary", "explain", "quiz", "flashcards"];

export function normalizeChatMode(value: unknown): string {
  if (typeof value === "string" && CHAT_MODES.includes(value)) {
    return value;
  }
  return CHAT_MODE_CHAT;
}

export const QUICK_ACTION_MODES: Record<string, string> = {
  summarise: "summary",
  flashcards: "flashcards",
  explain: "explain",
  quiz: "quiz",
};

export function quickActionToMode(actionId?: string): string {
  return QUICK_ACTION_MODES[actionId ?? ""] ?? CHAT_MODE_CHAT;
}