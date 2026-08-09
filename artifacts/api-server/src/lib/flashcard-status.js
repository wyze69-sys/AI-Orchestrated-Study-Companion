/**
 * Single shared source of truth for flashcard mastery status values.
 * Used by the API route validation and its unit tests so the accepted
 * status names can never drift apart.
 */
export const VALID_FLASHCARD_STATUSES = ["known", "review"];

/**
 * Validates the flashcard progress payload shape used by the route.
 * Accepts a single item, an item array, or { progress: [...] }.
 *
 * @param {*} body
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateFlashcardStatusInput(body) {
  const rawItems = Array.isArray(body)
    ? body
    : Array.isArray(body?.progress)
    ? body.progress
    : body
    ? [body]
    : [];
  if (rawItems.length === 0) {
    return { valid: false, error: "At least one progress item is required" };
  }
  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      return { valid: false, error: "Invalid progress item" };
    }
    if (item.cardId == null || String(item.cardId).trim() === "") {
      return { valid: false, error: "cardId is required for all progress items" };
    }
    if (String(item.cardId).trim().length > 200) {
      return { valid: false, error: "cardId must not exceed 200 characters" };
    }
    if (!VALID_FLASHCARD_STATUSES.includes(item.status)) {
      return { valid: false, error: `Invalid status "${item.status}". Must be 'known' or 'review'.` };
    }
  }
  return { valid: true, error: null };
}