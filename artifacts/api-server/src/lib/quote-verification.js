/**
 * Verifies an AI-provided quote against the actual document content and calculates
 * its exact location (offsets and 1-based line numbers).
 *
 * @param {string} content - The full raw document text.
 * @param {string} quote - The text quote to locate.
 * @returns {{ quote: string, startOffset: number, endOffset: number, startLine: number, endLine: number } | null}
 */
export function verifyQuoteInDocument(content, quote) {
  if (typeof content !== "string" || content.length === 0) {
    return null;
  }

  if (typeof quote !== "string") {
    return null;
  }

  const trimmedQuote = quote.trim();
  if (trimmedQuote.length === 0) {
    return null;
  }

  const startOffset = content.indexOf(trimmedQuote);
  if (startOffset === -1) {
    return null;
  }

  const endOffset = startOffset + trimmedQuote.length;

  const startLine = countNewlines(content, 0, startOffset) + 1;
  const endLine = countNewlines(content, 0, Math.max(startOffset, endOffset - 1)) + 1;

  return {
    quote: trimmedQuote,
    startOffset,
    endOffset,
    startLine,
    endLine,
  };
}

/**
 * Helper to count '\n' characters in content[start..end]
 */
function countNewlines(str, start, end) {
  let count = 0;
  for (let i = start; i < end; i++) {
    if (str[i] === "\n") {
      count++;
    }
  }
  return count;
}
