/**
 * Utility functions for parsing, validating, and managing interactive flashcards.
 *
 * Primary format: JSON (raw object or ```json block) matching schema:
 *   { flashcards: [{ id, front, back, explanation?, citation? }] }
 *
 * Fallback format: Q: / A: Markdown pairs (supported only if existing project
 * responses use that pattern — matches the existing quiz Markdown fallback approach).
 */

import { stableContentHash } from "./quiz.js";

/**
 * Deterministic, content-derived id for a flashcard. Two cards with the same
 * front/back content get the same id so review status survives reloads,
 * while cards with different content never collapse onto the same id.
 */
export function getStableCardId(front, back) {
  return `card-${stableContentHash(`${front}|${back}`)}`;
}

/**
 * Normalizes a raw flashcard object from the JSON parse step.
 * The id is the AI-provided one when non-empty and unique, otherwise a
 * stable content-derived id (so distinct decks in one session do not
 * overwrite one another's progress).
 * @param {*} raw - Raw object from JSON.parse
 * @param {number} index - Zero-based index for auto-assigned IDs
 * @returns {{ id, front, back, explanation, citation } | null}
 */
function normalizeJsonCard(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const front = String(raw.front || raw.question || raw.term || "").trim();
  const back = String(raw.back || raw.answer || raw.definition || "").trim();
  if (!front || !back) return null;
  const explanation = String(raw.explanation || raw.context || "").trim();
  const citationRaw = raw.citation || raw.source || null;
  const citation =
    citationRaw && typeof citationRaw === "object" && citationRaw.quote
      ? {
          quote: String(citationRaw.quote).trim(),
          startLine: Number(citationRaw.startLine) || null,
          endLine: Number(citationRaw.endLine) || null
        }
      : null;

  const rawId = raw.id != null ? String(raw.id).trim() : "";
  const id =
    rawId && rawId !== "null" && rawId !== "undefined"
      ? rawId
      : getStableCardId(front, back);

  return {
    id,
    front,
    back,
    explanation,
    citation
  };
}

/**
 * Assigns the final unique id for a card, de-duplicating AI-provided ids
 * that collide with earlier cards in the same response.
 */
function uniqueCardId(candidateId, front, back, index, usedIds) {
  if (!usedIds.has(String(candidateId))) {
    usedIds.add(String(candidateId));
    return candidateId;
  }
  // Collision: derive a unique content-based id.
  let alt = getStableCardId(front, back);
  let n = index + 1;
  while (usedIds.has(alt)) {
    alt = `${alt}-${n}`;
    n += 1;
  }
  usedIds.add(alt);
  return alt;
}

/**
 * Parses raw AI response text into a structured flashcard list.
 *
 * Strategy 1: JSON (```json block or raw object string)
 * Strategy 2: Q: / A: Markdown pairs (same pattern the quiz Markdown fallback uses)
 *
 * @param {string} rawText
 * @returns {{ cards: Array<{ id, front, back, explanation, citation }>, error: string|null }}
 */
export function parseFlashcardResponse(rawText) {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return { cards: [], error: "Empty flashcard response." };
  }

  const text = rawText.trim();

  // ── Strategy 1: JSON Parsing ─────────────────────────────────────────────
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, text];
  const jsonCandidate = (jsonMatch[1] || text).trim();

  if (jsonCandidate.startsWith("{") || jsonCandidate.startsWith("[")) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      const rawCards = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.flashcards)
        ? parsed.flashcards
        : Array.isArray(parsed.cards)
        ? parsed.cards
        : null;

      if (rawCards && rawCards.length > 0) {
        const usedCardIds = new Set();
        const valid = rawCards
          .map((raw, index) => {
            const card = normalizeJsonCard(raw, index);
            if (!card) return null;
            card.id = uniqueCardId(card.id, card.front, card.back, index, usedCardIds);
            return card;
          })
          .filter(Boolean);
        if (valid.length > 0) {
          return { cards: valid, error: null };
        }
      }
    } catch {
      // Fall through to Markdown strategy
    }
  }

  // ── Strategy 2: Q: / A: Markdown fallback ────────────────────────────────
  // Matches the existing "Q: ... A: ..." pair pattern common in flashcard AI output.
  try {
    const cards = [];
    // Split on Q: at the start of a line (with optional number prefix like "1. Q:" or "1) Q:")
    const qBlocks = text.split(/\n(?=\s*(?:\d+[\.\)]\s*)?Q:)/im);
    for (const block of qBlocks) {
      const qMatch = block.match(/Q:\s*([^\n]+)/i);
      const aMatch = block.match(/A:\s*([\s\S]*?)(?=(?:Q:|$))/i);
      if (!qMatch || !aMatch) continue;
      const front = qMatch[1].trim();
      const back = aMatch[1].trim();
      if (!front || !back) continue;
      const expMatch = block.match(/Explanation:\s*([\s\S]*?)(?=(?:Q:|$))/i);
      const explanation = expMatch ? expMatch[1].trim() : "";
      cards.push({
        id: getStableCardId(front, back),
        front,
        back,
        explanation,
        citation: null
      });
    }
    if (cards.length > 0) {
      return { cards, error: null };
    }
  } catch {
    // Ignore and fall through to error return
  }

  return { cards: [], error: "Invalid or malformed flashcard format returned by AI." };
}

/**
 * Returns navigation state for a flashcard deck.
 *
 * @param {number} currentIndex - 0-based index of the current card.
 * @param {number} totalCards - Total number of cards in the deck.
 * @returns {{ canGoBack: boolean, canGoForward: boolean, displayPosition: string }}
 */
export function getFlashcardNavState(currentIndex, totalCards) {
  if (!totalCards || totalCards < 1) {
    return { canGoBack: false, canGoForward: false, displayPosition: "0 / 0" };
  }
  return {
    canGoBack: currentIndex > 0,
    canGoForward: currentIndex < totalCards - 1,
    displayPosition: `${currentIndex + 1} / ${totalCards}`
  };
}

/**
 * Calculates flashcard mastery metrics (Known, Review again, Unreviewed)
 * and determines if the deck is fully completed.
 *
 * @param {Array<object>} cards - Array of card objects.
 * @param {Record<string|number, 'known'|'review'>} masteryState - Map of cardId to review status.
 * @returns {{ knownCount: number, reviewCount: number, unreviewedCount: number, totalCount: number, isCompleted: boolean }}
 */
export function calculateMasteryStats(cards = [], masteryState = {}) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return { knownCount: 0, reviewCount: 0, unreviewedCount: 0, totalCount: 0, isCompleted: false };
  }

  let knownCount = 0;
  let reviewCount = 0;
  let unreviewedCount = 0;

  for (const card of cards) {
    if (!card || card.id == null) continue;
    const status = masteryState[card.id];
    if (status === "known") {
      knownCount++;
    } else if (status === "review") {
      reviewCount++;
    } else {
      unreviewedCount++;
    }
  }

  const totalCount = cards.length;
  const isCompleted = totalCount > 0 && unreviewedCount === 0;

  return {
    knownCount,
    reviewCount,
    unreviewedCount,
    totalCount,
    isCompleted
  };
}
