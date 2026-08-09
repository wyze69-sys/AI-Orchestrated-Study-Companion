/**
 * Helpers for formatting and processing citation sources in the web UI.
 */

/**
 * Formats a 1-based start line and end line into a display string.
 * e.g., (1, 1) -> "Line 1", (1, 3) -> "Lines 1–3"
 *
 * @param {number} [startLine]
 * @param {number} [endLine]
 * @returns {string | null}
 */
export function formatLineRange(startLine, endLine) {
  if (!startLine || !endLine) return null;
  if (startLine === endLine) {
    return `Line ${startLine}`;
  }
  return `Lines ${startLine}–${endLine}`;
}

/**
 * Checks if a specific 1-based line number falls within a cited line range.
 *
 * @param {number} lineNum
 * @param {number} startLine
 * @param {number} [endLine]
 * @returns {boolean}
 */
export function isLineInCitationRange(lineNum, startLine, endLine) {
  if (typeof lineNum !== "number" || typeof startLine !== "number" || lineNum < 1 || startLine < 1) {
    return false;
  }
  const end = typeof endLine === "number" && endLine >= startLine ? endLine : startLine;
  return lineNum >= startLine && lineNum <= end;
}

/**
 * Checks if a keyboard event key represents an activation action (Enter or Space).
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isKeyboardActivationKey(key) {
  return key === "Enter" || key === " " || key === "Spacebar";
}

/**
 * Extracts and validates sources array from a final SSE frame payload.
 *
 * @param {object} sseFrame - The parsed JSON data from an SSE line.
 * @returns {Array<{ quote: string, startOffset: number, endOffset: number, startLine: number, endLine: number, filename?: string }>}
 */
export function extractSourcesFromFrame(sseFrame) {
  if (!sseFrame || typeof sseFrame !== "object") return [];
  if (!sseFrame.done) return [];
  if (!Array.isArray(sseFrame.sources)) return [];
  return sseFrame.sources.filter(
    (src) => src && typeof src === "object" && typeof src.quote === "string"
  );
}

/**
 * Normalizes an assistant message's sources array.
 * Safe for older assistant messages where sources property is undefined/null.
 *
 * @param {any} sources
 * @returns {Array<object>}
 */
export function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.filter((src) => src && typeof src === "object" && typeof src.quote === "string");
}

/**
 * Resolves a citation source object to a matching document object from the workspace documents list.
 * Safely returns null when no matching document is available (e.g. deleted or invalid source data).
 *
 * @param {Array<object>} documents - List of available session documents.
 * @param {object} source - Citation source object.
 * @param {string|number} [activeDocId] - Currently active document ID fallback.
 * @returns {object|null}
 */
export function findMatchingDocument(documents, source, activeDocId) {
  if (!Array.isArray(documents) || documents.length === 0 || !source || typeof source !== "object") {
    return null;
  }

  // 1. Try matching by explicit document ID if available
  const docIdTarget = source.documentId ?? source.document_id ?? source.docId;
  if (docIdTarget != null) {
    const docById = documents.find((d) => d && String(d.id) === String(docIdTarget));
    if (docById) return docById;
  }

  // 2. Try matching by filename if available
  if (typeof source.filename === "string" && source.filename.trim().length > 0) {
    const trimmedFilename = source.filename.trim();
    const docByFilename = documents.find((d) => d && d.filename === trimmedFilename);
    if (docByFilename) return docByFilename;

    const docByCaseInsensitive = documents.find(
      (d) => d && typeof d.filename === "string" && d.filename.toLowerCase() === trimmedFilename.toLowerCase()
    );
    if (docByCaseInsensitive) return docByCaseInsensitive;
  }

  // 3. If source has no filename or documentId, fallback to active document if valid
  if (activeDocId != null) {
    const activeDoc = documents.find((d) => d && String(d.id) === String(activeDocId));
    if (activeDoc) return activeDoc;
  }

  // 4. Fallback to first document if single document workspace
  if (documents.length === 1 && documents[0]) {
    return documents[0];
  }

  return null;
}
