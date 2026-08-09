import { stableContentHash } from "./quiz.ts";

export interface FlashcardCitation {
  quote: string;
  startLine: number | null;
  endLine: number | null;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  explanation: string;
  citation: { quote: string; startLine: number | null; endLine: number | null } | null;
}

export interface FlashcardParseResult {
  cards: Flashcard[];
  error: string | null;
}

export interface FlashcardNavState {
  canGoBack: boolean;
  canGoForward: boolean;
  displayPosition: string;
}

export interface MasteryStats {
  knownCount: number;
  reviewCount: number;
  unreviewedCount: number;
  totalCount: number;
  isCompleted: boolean;
}

export type MasteryStatus = "known" | "review";

/**
 * Deterministic, content-derived id for a flashcard. Two cards with the same
 * front/back content get the same id so review status survives reloads,
 * while cards with different content never collapse onto the same id.
 */
export function getStableCardId(front: string, back: string): string {
  return `card-${stableContentHash(`${front}|${back}`)}`;
}

/**
 * Normalizes a raw flashcard object. The id is the AI-provided one when
 * non-empty and unique, otherwise a stable content-derived id.
 */
function normalizeJsonCard(raw: unknown, index: number): Flashcard | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const front = String(record.front || record.question || record.term || "").trim();
  const back = String(record.back || record.answer || record.definition || "").trim();
  if (!front || !back) return null;
  const explanation = String(record.explanation || record.context || "").trim();
  const citationRaw = record.citation || record.source || null;
  const citation =
    citationRaw && typeof citationRaw === "object" && (citationRaw as Record<string, unknown>).quote
      ? {
          quote: String((citationRaw as Record<string, unknown>).quote).trim(),
          startLine: Number((citationRaw as Record<string, unknown>).startLine) || null,
          endLine: Number((citationRaw as Record<string, unknown>).endLine) || null
        }
      : null;

  const rawId = record.id != null ? String(record.id).trim() : "";
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

function uniqueCardId(candidateId: string, front: string, back: string, index: number, usedIds: Set<string>): string {
  if (!usedIds.has(String(candidateId))) {
    usedIds.add(String(candidateId));
    return candidateId;
  }
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
 * Strategy 1: JSON (```json code block or raw object string)
 * Strategy 2: Q: / A: Markdown pairs
 */
export function parseFlashcardResponse(rawText: unknown): FlashcardParseResult {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return { cards: [], error: "Empty flashcard response." };
  }

  const text = rawText.trim();

  // Strategy 1: JSON Parsing
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
        const usedCardIds = new Set<string>();
        const valid = rawCards
          .map((raw: unknown, index: number) => {
            const card = normalizeJsonCard(raw, index);
            if (!card) return null;
            card.id = uniqueCardId(card.id, card.front, card.back, index, usedCardIds);
            return card;
          })
          .filter(Boolean) as Flashcard[];
        if (valid.length > 0) {
          return { cards: valid, error: null };
        }
      }
    } catch {
      // Fall through to Markdown strategy
    }
  }

  // Strategy 2: Q: / A: Markdown fallback
  try {
    const cards: Flashcard[] = [];
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
 */
export function getFlashcardNavState(currentIndex: number, totalCards: number): FlashcardNavState {
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
 * Calculates flashcard mastery metrics and completion state.
 */
export function calculateMasteryStats(cards: Flashcard[] | null | undefined, masteryState: Record<string, MasteryStatus>): MasteryStats {
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

export interface CitationLike {
  quote: string;
  startLine: number | null;
  endLine: number | null;
}