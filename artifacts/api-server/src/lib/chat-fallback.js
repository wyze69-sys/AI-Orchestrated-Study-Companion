import { parseAndVerifyQuotes } from "./source-extraction.js";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "been", "being", "could", "does", "each",
  "explain", "from", "have", "help", "here", "into", "just", "main", "more", "need", "please", "should",
  "that", "the", "their", "there", "these", "they", "this", "those", "what", "when", "where", "which", "with",
  "would", "your"
]);

function getMeaningfulTerms(message) {
  return [...new Set(
    String(message ?? "")
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g)
      ?.filter((term) => !STOP_WORDS.has(term)) ?? []
  )];
}

function createGroundedChatFallback(documentContent, message) {
  if (typeof documentContent !== "string" || documentContent.trim() === "") {
    return { content: "The AI service is temporarily unavailable. Please try again shortly.", sources: [] };
  }

  const documentLower = documentContent.toLowerCase();
  const hasRelevantTerm = getMeaningfulTerms(message).some((term) => documentLower.includes(term));
  if (!hasRelevantTerm) {
    return {
      content: "The AI service is temporarily unavailable, and I cannot verify an answer to that question from this study material right now.",
      sources: []
    };
  }

  const quotes = documentContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
  const sources = parseAndVerifyQuotes(documentContent, JSON.stringify({ quotes }));
  const excerpts = sources.map((source) => `- ${source.quote}`).join("\n");

  return {
    content: `The AI service is temporarily unavailable. These verified passages from your study material are relevant:\n\n${excerpts}`,
    sources
  };
}

export { createGroundedChatFallback };
