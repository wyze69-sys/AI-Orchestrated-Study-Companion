/**
 * Citation Source data model and helpers for mobile app.
 */

export interface CitationSource {
  quote: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  filename?: string;
}

/**
 * Formats startLine and endLine into display line text.
 * e.g. (1, 1) -> "Line 1", (1, 3) -> "Lines 1–3"
 */
export function formatLineRange(startLine?: number, endLine?: number): string | null {
  if (!startLine || !endLine) return null;
  if (startLine === endLine) {
    return `Line ${startLine}`;
  }
  return `Lines ${startLine}–${endLine}`;
}

/**
 * Extracts verified sources array from an SSE payload frame.
 */
export function extractSourcesFromFrame(sseFrame: any): CitationSource[] {
  if (!sseFrame || typeof sseFrame !== "object") return [];
  if (!sseFrame.done) return [];
  if (!Array.isArray(sseFrame.sources)) return [];
  return sseFrame.sources.filter(
    (src: any) => src && typeof src === "object" && typeof src.quote === "string"
  );
}

/**
 * Safely normalizes an assistant message's sources property.
 * Safe for historical messages where sources is missing/undefined/null.
 */
export function normalizeSources(sources: any): CitationSource[] {
  if (!Array.isArray(sources)) return [];
  return sources.filter(
    (src: any) => src && typeof src === "object" && typeof src.quote === "string"
  );
}
