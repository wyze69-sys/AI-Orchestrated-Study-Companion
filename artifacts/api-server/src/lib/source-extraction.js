import { verifyQuoteInDocument } from "./quote-verification.js";

/**
 * Extracts and verifies supporting quotes from document content for an AI answer.
 *
 * @param {string} docContent - Full text of the study document.
 * @param {string} answerText - The generated AI answer.
 * @param {object} aiClient - The Gemini AI client instance.
 * @param {AbortSignal} [signal] - Optional abort signal.
 * @returns {Promise<Array<{ quote: string, startOffset: number, endOffset: number, startLine: number, endLine: number }>>}
 */
export async function extractVerifiedSources(docContent, answerText, aiClient, signal) {
  if (typeof docContent !== "string" || docContent.length === 0) {
    return [];
  }

  if (typeof answerText !== "string" || answerText.trim().length === 0) {
    return [];
  }

  try {
    const response = await aiClient.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Given the study document and the assistant answer below, return up to 3 exact verbatim quotes from the study document that support the answer.

Document:
---
${docContent}
---

Answer:
${answerText}

Return ONLY a JSON object matching this schema:
{"quotes": ["exact verbatim quote 1", "exact verbatim quote 2"]}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 1024,
        ...(signal ? { abortSignal: signal } : {}),
      },
    });

    const rawText = response?.text?.trim() ?? "";
    return parseAndVerifyQuotes(docContent, rawText);
  } catch (err) {
    // Extraction failure must return [] without failing the chat
    return [];
  }
}

/**
 * Pure helper to parse raw JSON output, verify quotes against document content,
 * discard non-matching quotes, deduplicate, and limit to max 3.
 *
 * @param {string} docContent
 * @param {string} jsonText
 * @returns {Array<{ quote: string, startOffset: number, endOffset: number, startLine: number, endLine: number }>}
 */
export function parseAndVerifyQuotes(docContent, jsonText) {
  if (typeof jsonText !== "string" || jsonText.trim().length === 0) {
    return [];
  }

  let parsed;
  try {
    const cleaned = jsonText.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.quotes)) {
    return [];
  }

  const verified = [];
  const seenOffsets = new Set();

  for (const rawQuote of parsed.quotes) {
    if (typeof rawQuote !== "string") continue;

    const match = verifyQuoteInDocument(docContent, rawQuote);
    if (!match) continue; // Discard hallucinated or non-matching quotes

    const offsetKey = `${match.startOffset}:${match.endOffset}`;
    if (seenOffsets.has(offsetKey)) continue; // Remove duplicates
    seenOffsets.add(offsetKey);

    verified.push(match);
    if (verified.length >= 3) break; // Limit to maximum of 3 sources
  }

  return verified;
}
