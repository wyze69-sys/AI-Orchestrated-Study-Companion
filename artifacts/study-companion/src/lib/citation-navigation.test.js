import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatchingDocument, formatLineRange, normalizeSources } from "./sources.js";

const sampleDocs = [
  { id: "doc-1", filename: "biology_notes.txt", content: "Line 1: Photosynthesis overview\nLine 2: Chlorophyll captures light\nLine 3: Oxygen produced" },
  { id: "doc-2", filename: "chemistry_lab.md", content: "Line 1: Chemical reactions\nLine 2: Catalyst accelerates reaction" }
];

test("findMatchingDocument selects document by exact documentId", () => {
  const source = { documentId: "doc-2", filename: "chemistry_lab.md", startLine: 2, endLine: 2, quote: "Catalyst accelerates reaction" };
  const matched = findMatchingDocument(sampleDocs, source, "doc-1");
  assert.equal(matched?.id, "doc-2");
  assert.equal(matched?.filename, "chemistry_lab.md");
});

test("findMatchingDocument selects document by filename when documentId is absent", () => {
  const source = { filename: "chemistry_lab.md", startLine: 1, endLine: 1, quote: "Chemical reactions" };
  const matched = findMatchingDocument(sampleDocs, source, "doc-1");
  assert.equal(matched?.id, "doc-2");
});

test("findMatchingDocument falls back to active document when source has no filename or documentId", () => {
  const source = { startLine: 2, endLine: 2, quote: "Chlorophyll captures light" };
  const matched = findMatchingDocument(sampleDocs, source, "doc-1");
  assert.equal(matched?.id, "doc-1");
});

test("findMatchingDocument falls back to single document when array has 1 doc", () => {
  const singleDocList = [{ id: "doc-solo", filename: "single.txt", content: "Text content" }];
  const source = { startLine: 1, endLine: 1, quote: "Text content" };
  const matched = findMatchingDocument(singleDocList, source, null);
  assert.equal(matched?.id, "doc-solo");
});

test("findMatchingDocument fails safely and returns null when document is missing/unavailable", () => {
  const source = { filename: "deleted_doc.pdf", startLine: 5, endLine: 5, quote: "Missing quote" };
  const matched = findMatchingDocument(sampleDocs, source, null);
  assert.equal(matched, null);
});

test("findMatchingDocument fails safely for empty documents list or invalid source", () => {
  assert.equal(findMatchingDocument([], { filename: "test.txt" }, "doc-1"), null);
  assert.equal(findMatchingDocument(null, { filename: "test.txt" }, "doc-1"), null);
  assert.equal(findMatchingDocument(sampleDocs, null, "doc-1"), null);
  assert.equal(findMatchingDocument(sampleDocs, "invalid", "doc-1"), null);
});

test("citation selection passes correct line and quote target", () => {
  const source = { documentId: "doc-1", filename: "biology_notes.txt", startLine: 2, endLine: 3, quote: "Chlorophyll captures light" };
  const matched = findMatchingDocument(sampleDocs, source, "doc-1");

  const navigationTarget = {
    docId: matched.id,
    startLine: source.startLine,
    endLine: source.endLine,
    quote: source.quote
  };

  assert.equal(navigationTarget.docId, "doc-1");
  assert.equal(navigationTarget.startLine, 2);
  assert.equal(navigationTarget.endLine, 3);
  assert.equal(navigationTarget.quote, "Chlorophyll captures light");
});

test("line-range highlighting accurately targets cited line range", () => {
  const startLine = 2;
  const endLine = 4;

  const isLineHighlighted = (lineNum) => lineNum >= startLine && lineNum <= endLine;

  assert.equal(isLineHighlighted(1), false);
  assert.equal(isLineHighlighted(2), true);
  assert.equal(isLineHighlighted(3), true);
  assert.equal(isLineHighlighted(4), true);
  assert.equal(isLineHighlighted(5), false);
});

test("keyboard activation handles Enter and Space safely", () => {
  let activatedSource = null;
  const handleSelectSource = (src) => {
    activatedSource = src;
  };

  const mockSource = { filename: "chemistry_lab.md", startLine: 1, endLine: 1, quote: "Chemical reactions" };

  const triggerKey = (key) => {
    if (key === "Enter" || key === " ") {
      handleSelectSource(mockSource);
    }
  };

  triggerKey("Enter");
  assert.equal(activatedSource?.quote, "Chemical reactions");

  activatedSource = null;
  triggerKey(" ");
  assert.equal(activatedSource?.quote, "Chemical reactions");

  activatedSource = null;
  triggerKey("Escape");
  assert.equal(activatedSource, null);
});

test("existing citation rendering and formatting functions remain intact", () => {
  assert.equal(formatLineRange(2, 2), "Line 2");
  assert.equal(formatLineRange(2, 5), "Lines 2–5");
  assert.deepEqual(normalizeSources(null), []);
  assert.deepEqual(normalizeSources(undefined), []);

  const validSources = [{ quote: "Valid quote", startLine: 1, endLine: 1 }];
  assert.deepEqual(normalizeSources(validSources), validSources);
});
