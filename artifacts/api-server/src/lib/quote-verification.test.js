import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyQuoteInDocument } from "./quote-verification.js";

test("exact single-line match", () => {
  const content = "Hello world\nThis is a test document.\nEnd of document.";
  const quote = "This is a test document.";

  const result = verifyQuoteInDocument(content, quote);
  assert.deepEqual(result, {
    quote: "This is a test document.",
    startOffset: 12,
    endOffset: 36,
    startLine: 2,
    endLine: 2,
  });
});

test("exact multi-line match", () => {
  const content = "Line 1\nLine 2\nLine 3\nLine 4";
  const quote = "Line 2\nLine 3";

  const result = verifyQuoteInDocument(content, quote);
  assert.deepEqual(result, {
    quote: "Line 2\nLine 3",
    startOffset: 7,
    endOffset: 20,
    startLine: 2,
    endLine: 3,
  });
});

test("correct offsets and 1-based lines", () => {
  const content = "0123456789\nABCDEFGHIJ\nKLMNOPQRST";
  const quote = "DEF";

  const result = verifyQuoteInDocument(content, quote);
  assert.notEqual(result, null);
  assert.equal(result.startOffset, 14);
  assert.equal(result.endOffset, 17);
  assert.equal(result.startLine, 2);
  assert.equal(result.endLine, 2);
  assert.equal(content.slice(result.startOffset, result.endOffset), "DEF");
});

test("empty content returns null", () => {
  assert.equal(verifyQuoteInDocument("", "quote"), null);
  assert.equal(verifyQuoteInDocument(null, "quote"), null);
  assert.equal(verifyQuoteInDocument(undefined, "quote"), null);
});

test("empty quote returns null", () => {
  const content = "Sample content text";
  assert.equal(verifyQuoteInDocument(content, ""), null);
  assert.equal(verifyQuoteInDocument(content, "   "), null);
  assert.equal(verifyQuoteInDocument(content, "\n\t"), null);
  assert.equal(verifyQuoteInDocument(content, null), null);
  assert.equal(verifyQuoteInDocument(content, undefined), null);
});

test("missing quote returns null", () => {
  const content = "Photosynthesis is the process by which plants use sunlight.";
  const quote = "mitochondria is the powerhouse";

  assert.equal(verifyQuoteInDocument(content, quote), null);
});

test("repeated quote uses the first occurrence", () => {
  const content = "apple pie\napple tart\napple cake";
  const quote = "apple";

  const result = verifyQuoteInDocument(content, quote);
  assert.deepEqual(result, {
    quote: "apple",
    startOffset: 0,
    endOffset: 5,
    startLine: 1,
    endLine: 1,
  });
});

test("CRLF content line counting and offsets", () => {
  const content = "First line\r\nSecond line\r\nThird line";
  const quote = "Second line";

  const result = verifyQuoteInDocument(content, quote);
  assert.deepEqual(result, {
    quote: "Second line",
    startOffset: 12,
    endOffset: 23,
    startLine: 2,
    endLine: 2,
  });
});

test("quote with surrounding whitespace is trimmed before matching", () => {
  const content = "Header\n  Target text content  \nFooter";
  const quote = "   Target text content   ";

  const result = verifyQuoteInDocument(content, quote);
  assert.deepEqual(result, {
    quote: "Target text content",
    startOffset: 9,
    endOffset: 28,
    startLine: 2,
    endLine: 2,
  });
});

test("quote with altered wording does not match", () => {
  const content = "The quick brown fox jumps over the lazy dog.";
  const quote = "The fast brown fox jumps over the lazy dog.";

  assert.equal(verifyQuoteInDocument(content, quote), null);
});
