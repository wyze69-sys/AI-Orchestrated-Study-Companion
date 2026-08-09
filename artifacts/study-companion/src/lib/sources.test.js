import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatLineRange,
  extractSourcesFromFrame,
  normalizeSources,
  isLineInCitationRange,
  isKeyboardActivationKey
} from "./sources.js";

test("formatLineRange formats single line correctly", () => {
  assert.equal(formatLineRange(1, 1), "Line 1");
  assert.equal(formatLineRange(42, 42), "Line 42");
});

test("formatLineRange formats multi-line ranges correctly", () => {
  assert.equal(formatLineRange(1, 3), "Lines 1–3");
  assert.equal(formatLineRange(10, 15), "Lines 10–15");
});

test("formatLineRange returns null for missing or invalid lines", () => {
  assert.equal(formatLineRange(null, null), null);
  assert.equal(formatLineRange(undefined, 3), null);
  assert.equal(formatLineRange(1, undefined), null);
});

test("extractSourcesFromFrame extracts sources from final done frame", () => {
  const frame = {
    done: true,
    sources: [
      { quote: "Photosynthesis converts light", startOffset: 0, endOffset: 29, startLine: 1, endLine: 1 },
      { quote: "Chlorophyll captures light", startOffset: 30, endOffset: 56, startLine: 2, endLine: 2 }
    ]
  };

  const sources = extractSourcesFromFrame(frame);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].quote, "Photosynthesis converts light");
  assert.equal(sources[0].startLine, 1);
  assert.equal(sources[1].quote, "Chlorophyll captures light");
  assert.equal(sources[1].startLine, 2);
});

test("extractSourcesFromFrame returns empty list when done has no sources", () => {
  const frameWithEmptySources = { done: true, sources: [] };
  assert.deepEqual(extractSourcesFromFrame(frameWithEmptySources), []);

  const frameWithoutSourcesKey = { done: true };
  assert.deepEqual(extractSourcesFromFrame(frameWithoutSourcesKey), []);

  const notDoneFrame = { done: false, sources: [{ quote: "test" }] };
  assert.deepEqual(extractSourcesFromFrame(notDoneFrame), []);
});

test("normalizeSources safely handles older assistant messages without sources", () => {
  assert.deepEqual(normalizeSources(undefined), []);
  assert.deepEqual(normalizeSources(null), []);
  assert.deepEqual(normalizeSources("invalid"), []);
  assert.deepEqual(normalizeSources({}), []);
});

test("normalizeSources preserves valid source arrays", () => {
  const validSources = [
    { quote: "Valid quote", startOffset: 0, endOffset: 11, startLine: 1, endLine: 1 }
  ];
  assert.deepEqual(normalizeSources(validSources), validSources);
});

test("isLineInCitationRange evaluates single line and multi-line ranges correctly", () => {
  assert.equal(isLineInCitationRange(2, 2, 2), true);
  assert.equal(isLineInCitationRange(2, 1, 3), true);
  assert.equal(isLineInCitationRange(1, 2, 4), false);
  assert.equal(isLineInCitationRange(5, 2, 4), false);
  assert.equal(isLineInCitationRange(0, 1, 3), false);
  assert.equal(isLineInCitationRange(null, 1, 3), false);
});

test("isKeyboardActivationKey identifies Enter and Space keys", () => {
  assert.equal(isKeyboardActivationKey("Enter"), true);
  assert.equal(isKeyboardActivationKey(" "), true);
  assert.equal(isKeyboardActivationKey("Spacebar"), true);
  assert.equal(isKeyboardActivationKey("Tab"), false);
  assert.equal(isKeyboardActivationKey("a"), false);
});
