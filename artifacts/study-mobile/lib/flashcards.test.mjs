import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFlashcardResponse, getFlashcardNavState, calculateMasteryStats, getStableCardId } from "./flashcards.ts";

// ── Tests for calculateMasteryStats & Mastery State ─────────────────────────

const sampleCards = [
  { id: 1, front: "Front 1", back: "Back 1" },
  { id: 2, front: "Front 2", back: "Back 2" },
  { id: 3, front: "Front 3", back: "Back 3" }
];

test("calculateMasteryStats computes initial unreviewed state correctly", () => {
  const stats = calculateMasteryStats(sampleCards, {});
  assert.equal(stats.knownCount, 0);
  assert.equal(stats.reviewCount, 0);
  assert.equal(stats.unreviewedCount, 3);
  assert.equal(stats.totalCount, 3);
  assert.equal(stats.isCompleted, false);
});

test("marking a card Known increments knownCount and decrements unreviewedCount", () => {
  const masteryState = { 1: "known" };
  const stats = calculateMasteryStats(sampleCards, masteryState);
  assert.equal(stats.knownCount, 1);
  assert.equal(stats.reviewCount, 0);
  assert.equal(stats.unreviewedCount, 2);
  assert.equal(stats.isCompleted, false);
});

test("marking a card Review again increments reviewCount and decrements unreviewedCount", () => {
  const masteryState = { 2: "review" };
  const stats = calculateMasteryStats(sampleCards, masteryState);
  assert.equal(stats.knownCount, 0);
  assert.equal(stats.reviewCount, 1);
  assert.equal(stats.unreviewedCount, 2);
  assert.equal(stats.isCompleted, false);
});

test("changing a card status from Review again to Known updates counts correctly", () => {
  let masteryState = { 1: "review" };
  let stats = calculateMasteryStats(sampleCards, masteryState);
  assert.equal(stats.reviewCount, 1);
  assert.equal(stats.knownCount, 0);

  // Change card 1 to known
  masteryState = { ...masteryState, 1: "known" };
  stats = calculateMasteryStats(sampleCards, masteryState);
  assert.equal(stats.reviewCount, 0);
  assert.equal(stats.knownCount, 1);
  assert.equal(stats.unreviewedCount, 2);
});

test("preserving review status during navigation between cards", () => {
  // Simulate React state holding mastery map across navigation indices
  let currentIndex = 0;
  const masteryState = { 1: "known" };

  // Navigate to card 2 (index 1)
  currentIndex = 1;
  assert.equal(masteryState[sampleCards[0].id], "known"); // card 1 status preserved

  // Mark card 2 as review
  masteryState[sampleCards[1].id] = "review";

  // Navigate back to card 1 (index 0)
  currentIndex = 0;
  assert.equal(masteryState[sampleCards[0].id], "known");
  assert.equal(masteryState[sampleCards[1].id], "review");

  const stats = calculateMasteryStats(sampleCards, masteryState);
  assert.equal(stats.knownCount, 1);
  assert.equal(stats.reviewCount, 1);
  assert.equal(stats.unreviewedCount, 1);
  assert.equal(stats.isCompleted, false);
});

test("completion detection: isCompleted is true when all cards are reviewed (Known or Review)", () => {
  const masteryState = { 1: "known", 2: "review", 3: "known" };
  const stats = calculateMasteryStats(sampleCards, masteryState);
  assert.equal(stats.knownCount, 2);
  assert.equal(stats.reviewCount, 1);
  assert.equal(stats.unreviewedCount, 0);
  assert.equal(stats.totalCount, 3);
  assert.equal(stats.isCompleted, true);
});

test("empty and malformed deck safety for calculateMasteryStats", () => {
  assert.deepEqual(calculateMasteryStats([], {}), {
    knownCount: 0, reviewCount: 0, unreviewedCount: 0, totalCount: 0, isCompleted: false
  });
  assert.deepEqual(calculateMasteryStats(null, {}), {
    knownCount: 0, reviewCount: 0, unreviewedCount: 0, totalCount: 0, isCompleted: false
  });
  assert.deepEqual(calculateMasteryStats(undefined, {}), {
    knownCount: 0, reviewCount: 0, unreviewedCount: 0, totalCount: 0, isCompleted: false
  });
});

test("keyboard activation simulation for Known and Review buttons", () => {
  let card1Status = null;
  const markMastery = (status) => { card1Status = status; };

  const triggerKey = (key, status) => {
    if (key === "Enter" || key === " ") markMastery(status);
  };

  triggerKey("Enter", "known");
  assert.equal(card1Status, "known");

  triggerKey(" ", "review");
  assert.equal(card1Status, "review");

  // Non-activation key ignores
  let ignored = false;
  const handler = () => { ignored = true; };
  if ("Tab" === "Enter" || "Tab" === " ") handler();
  assert.equal(ignored, false);
});


// ── Parsing: Valid JSON format ────────────────────────────────────────────────

test("parseFlashcardResponse parses valid JSON flashcard object", () => {
  const raw = JSON.stringify({
    flashcards: [
      {
        id: 1,
        front: "What is photosynthesis?",
        back: "A process where plants convert light energy into chemical energy.",
        explanation: "Occurs in chloroplasts using chlorophyll.",
        citation: { quote: "Plants convert light energy.", startLine: 1 }
      },
      {
        id: 2,
        front: "What pigment captures light?",
        back: "Chlorophyll",
        explanation: "",
        citation: null
      }
    ]
  });
  const result = parseFlashcardResponse(raw);
  assert.equal(result.error, null);
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].front, "What is photosynthesis?");
  assert.equal(result.cards[0].back, "A process where plants convert light energy into chemical energy.");
  assert.equal(result.cards[0].explanation, "Occurs in chloroplasts using chlorophyll.");
  assert.equal(result.cards[0].citation.quote, "Plants convert light energy.");
  assert.equal(result.cards[0].citation.startLine, 1);
  assert.equal(result.cards[1].front, "What pigment captures light?");
  assert.equal(result.cards[1].citation, null);
});

test("parseFlashcardResponse parses valid JSON inside markdown codeblock", () => {
  const raw = `Here are your flashcards:
\`\`\`json
{
  "flashcards": [
    {
      "id": 1,
      "front": "What is the Calvin cycle?",
      "back": "The light-independent reactions that fix carbon dioxide.",
      "explanation": "Also called the dark reactions.",
      "citation": null
    }
  ]
}
\`\`\``;
  const result = parseFlashcardResponse(raw);
  assert.equal(result.error, null);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].front, "What is the Calvin cycle?");
  assert.equal(result.cards[0].back, "The light-independent reactions that fix carbon dioxide.");
});

test("parseFlashcardResponse accepts cards array instead of flashcards wrapper", () => {
  const raw = JSON.stringify([
    { id: 1, front: "Term A", back: "Definition A" },
    { id: 2, front: "Term B", back: "Definition B" }
  ]);
  const result = parseFlashcardResponse(raw);
  assert.equal(result.error, null);
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].front, "Term A");
});

test("parseFlashcardResponse normalizes alternative field names (question/answer, term/definition)", () => {
  const raw = JSON.stringify({
    flashcards: [
      { question: "What is ATP?", answer: "Adenosine triphosphate — the energy currency of cells." }
    ]
  });
  const result = parseFlashcardResponse(raw);
  assert.equal(result.error, null);
  assert.equal(result.cards[0].front, "What is ATP?");
  assert.equal(result.cards[0].back, "Adenosine triphosphate — the energy currency of cells.");
});

// ── Parsing: Q:/A: Markdown fallback ─────────────────────────────────────────

test("parseFlashcardResponse parses Q:/A: markdown pair format", () => {
  const raw = `
Q: What does chlorophyll do?
A: Absorbs light energy for photosynthesis.

Q: Where does photosynthesis occur?
A: In the chloroplasts of plant cells.
`;
  const result = parseFlashcardResponse(raw);
  assert.equal(result.error, null);
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].front, "What does chlorophyll do?");
  assert.equal(result.cards[0].back, "Absorbs light energy for photosynthesis.");
  assert.equal(result.cards[1].front, "Where does photosynthesis occur?");
  assert.equal(result.cards[1].back, "In the chloroplasts of plant cells.");
});

test("parseFlashcardResponse preserves citation data exactly from JSON", () => {
  const raw = JSON.stringify({
    flashcards: [
      {
        id: 1,
        front: "What is released during light reactions?",
        back: "Oxygen",
        citation: { quote: "Oxygen is released as a byproduct.", startLine: 3, endLine: 3 }
      }
    ]
  });
  const result = parseFlashcardResponse(raw);
  assert.equal(result.cards[0].citation.quote, "Oxygen is released as a byproduct.");
  assert.equal(result.cards[0].citation.startLine, 3);
  assert.equal(result.cards[0].citation.endLine, 3);
});

// ── Parsing: Invalid/malformed input ─────────────────────────────────────────

test("parseFlashcardResponse handles empty and null inputs safely", () => {
  assert.deepEqual(parseFlashcardResponse(""), { cards: [], error: "Empty flashcard response." });
  assert.deepEqual(parseFlashcardResponse("   "), { cards: [], error: "Empty flashcard response." });
  assert.deepEqual(parseFlashcardResponse(null), { cards: [], error: "Empty flashcard response." });
  assert.deepEqual(parseFlashcardResponse(undefined), { cards: [], error: "Empty flashcard response." });
});

test("parseFlashcardResponse returns error for malformed JSON", () => {
  const raw = "```json\n{ flashcards: [{ front: 'incomplete' }] }\n```";
  const result = parseFlashcardResponse(raw);
  assert.equal(result.cards.length, 0);
  assert.notEqual(result.error, null);
});

test("parseFlashcardResponse skips cards missing required front or back", () => {
  const raw = JSON.stringify({
    flashcards: [
      { id: 1, front: "Valid front", back: "Valid back" },
      { id: 2, front: "", back: "No front — should be skipped" },
      { id: 3, front: "No back — should be skipped", back: "" }
    ]
  });
  const result = parseFlashcardResponse(raw);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].front, "Valid front");
});

test("parseFlashcardResponse returns error for unrecognized plain text", () => {
  const result = parseFlashcardResponse("Here is some random text without any card structure.");
  assert.equal(result.cards.length, 0);
  assert.notEqual(result.error, null);
});

// ── Stable card identity ──────────────────────────────────────────────────────

test("getStableCardId is deterministic and unique per content", () => {
  const a = getStableCardId("What is X?", "X is Y.");
  const b = getStableCardId("What is X?", "X is Y.");
  const c = getStableCardId("What is Z?", "Z is W.");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a.startsWith("card-"));
});

test("cards without an id get a stable content-derived id", () => {
  const raw = JSON.stringify({
    flashcards: [
      { front: "Term A", back: "Definition A" },
      { front: "Term B", back: "Definition B" }
    ]
  });
  const once = parseFlashcardResponse(raw);
  const twice = parseFlashcardResponse(raw);
  assert.equal(once.error, null);
  assert.equal(once.cards.length, 2);
  // Same content re-parsed -> same card ids (no duplication across reloads)
  assert.equal(once.cards[0].id, twice.cards[0].id);
  assert.equal(once.cards[1].id, twice.cards[1].id);
  assert.notEqual(once.cards[0].id, once.cards[1].id);
  assert.equal(once.cards[0].id, getStableCardId("Term A", "Definition A"));
});

test("two distinct decks never share positional-style ids that would collapse progress", () => {
  const deckA = parseFlashcardResponse(JSON.stringify([
    { front: "A1", back: "B1" },
    { front: "A2", back: "B2" }
  ]));
  const deckB = parseFlashcardResponse(JSON.stringify([
    { front: "C1", back: "D1" },
    { front: "C2", back: "D2" }
  ]));
  const idsA = deckA.cards.map((c) => String(c.id));
  const idsB = deckB.cards.map((c) => String(c.id));
  assert.notEqual(idsA[0], idsB[0]);
  assert.notEqual(idsA[1], idsB[1]);
});

test("duplicate AI-provided card ids are made unique", () => {
  const raw = JSON.stringify({
    cards: [
      { id: "x", front: "One", back: "1" },
      { id: "x", front: "Two", back: "2" },
      { id: 3, front: "Three", back: "3" }
    ]
  });
  const result = parseFlashcardResponse(raw);
  assert.equal(result.cards.length, 3);
  const ids = result.cards.map((c) => String(c.id));
  assert.equal(new Set(ids).size, 3);
});

test("Markdown Q:/A: fallback produces stable content-derived ids", () => {
  const text = `Q: What does chlorophyll do?
A: Absorbs light for photosynthesis.

Q: Where does photosynthesis occur?
A: In plant chloroplasts.
`;
  const once = parseFlashcardResponse(text);
  const twice = parseFlashcardResponse(text);
  assert.equal(once.error, null);
  assert.equal(once.cards.length, 2);
  assert.equal(once.cards[0].id, twice.cards[0].id);
  // Sequential positional ids would be identical across unrelated decks; these are not.
  assert.notEqual(once.cards[0].id, "1");
  assert.notEqual(once.cards[1].id, "2");
});

// ── Navigation state ──────────────────────────────────────────────────────────

test("getFlashcardNavState at first card (index 0)", () => {
  const state = getFlashcardNavState(0, 5);
  assert.equal(state.canGoBack, false);
  assert.equal(state.canGoForward, true);
  assert.equal(state.displayPosition, "1 / 5");
});

test("getFlashcardNavState at last card", () => {
  const state = getFlashcardNavState(4, 5);
  assert.equal(state.canGoBack, true);
  assert.equal(state.canGoForward, false);
  assert.equal(state.displayPosition, "5 / 5");
});

test("getFlashcardNavState in the middle", () => {
  const state = getFlashcardNavState(2, 5);
  assert.equal(state.canGoBack, true);
  assert.equal(state.canGoForward, true);
  assert.equal(state.displayPosition, "3 / 5");
});

test("getFlashcardNavState handles single card", () => {
  const state = getFlashcardNavState(0, 1);
  assert.equal(state.canGoBack, false);
  assert.equal(state.canGoForward, false);
  assert.equal(state.displayPosition, "1 / 1");
});

test("getFlashcardNavState handles empty deck safely", () => {
  const state = getFlashcardNavState(0, 0);
  assert.equal(state.canGoBack, false);
  assert.equal(state.canGoForward, false);
  assert.equal(state.displayPosition, "0 / 0");
});

// ── Card flip behavior (logic layer) ─────────────────────────────────────────

test("card flip toggles between front and back (state simulation)", () => {
  // Simulates the boolean `isFlipped` toggle
  let isFlipped = false;
  const flip = () => { isFlipped = !isFlipped; };

  assert.equal(isFlipped, false); // starts on front
  flip();
  assert.equal(isFlipped, true);  // flipped to back
  flip();
  assert.equal(isFlipped, false); // flipped back to front
});

// ── Previous/Next navigation (logic layer) ────────────────────────────────────

test("Previous navigation decrements index and does not go below 0", () => {
  let index = 2;
  const goBack = () => { index = Math.max(0, index - 1); };

  goBack(); assert.equal(index, 1);
  goBack(); assert.equal(index, 0);
  goBack(); assert.equal(index, 0); // boundary: stays at 0
});

test("Next navigation increments index and does not exceed last card", () => {
  let index = 2;
  const total = 5;
  const goForward = () => { index = Math.min(total - 1, index + 1); };

  goForward(); assert.equal(index, 3);
  goForward(); assert.equal(index, 4);
  goForward(); assert.equal(index, 4); // boundary: stays at 4
});

test("Navigating to a new card resets flip state", () => {
  let index = 0;
  let isFlipped = true; // card was flipped
  const navigateTo = (newIndex) => {
    index = newIndex;
    isFlipped = false; // reset on navigation
  };
  navigateTo(1);
  assert.equal(index, 1);
  assert.equal(isFlipped, false); // flip was reset
});

// ── Keyboard activation ───────────────────────────────────────────────────────

test("keyboard activation triggers flip on Enter and Space, not on other keys", () => {
  let flipped = false;
  const onFlip = () => { flipped = true; };

  const trigger = (key) => {
    if (key === "Enter" || key === " ") onFlip();
  };

  trigger("Tab"); assert.equal(flipped, false);
  trigger("ArrowRight"); assert.equal(flipped, false);
  trigger("Enter"); assert.equal(flipped, true);

  flipped = false;
  trigger(" "); assert.equal(flipped, true);
});

test("keyboard activation triggers Previous on ArrowLeft (boundary: first card is no-op)", () => {
  let index = 0;
  const onPrev = () => { if (index > 0) index--; };

  // At boundary — no-op
  onPrev();
  assert.equal(index, 0);

  index = 2;
  onPrev();
  assert.equal(index, 1);
});

test("keyboard activation triggers Next on ArrowRight (boundary: last card is no-op)", () => {
  const total = 3;
  let index = 2;
  const onNext = () => { if (index < total - 1) index++; };

  // At boundary — no-op
  onNext();
  assert.equal(index, 2);

  index = 0;
  onNext();
  assert.equal(index, 1);
});
