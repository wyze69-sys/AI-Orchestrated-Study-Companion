import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLineRange, extractSourcesFromFrame, normalizeSources } from "./sources.ts";

test("formatLineRange formats single line correctly", () => {
  assert.equal(formatLineRange(1, 1), "Line 1");
  assert.equal(formatLineRange(42, 42), "Line 42");
});

test("formatLineRange formats multi-line ranges correctly", () => {
  assert.equal(formatLineRange(1, 3), "Lines 1–3");
  assert.equal(formatLineRange(10, 15), "Lines 10–15");
});

test("formatLineRange returns null for invalid or missing lines", () => {
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

test("extractSourcesFromFrame returns empty array when frame has empty sources", () => {
  const emptyFrame = { done: true, sources: [] };
  assert.deepEqual(extractSourcesFromFrame(emptyFrame), []);
});

test("persisted sources survive message reload mapping", () => {
  const fetchedMessagesFromApi = [
    { id: "m1", role: "user", content: "Explain photosynthesis", sources: [] },
    {
      id: "m2",
      role: "assistant",
      content: "Photosynthesis converts light...",
      sources: [
        { quote: "Photosynthesis converts light energy", startOffset: 0, endOffset: 36, startLine: 1, endLine: 1 }
      ]
    }
  ];

  const restoredMessages = fetchedMessagesFromApi.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    sources: m.sources ?? []
  }));

  assert.equal(restoredMessages[1].sources.length, 1);
  assert.equal(restoredMessages[1].sources[0].quote, "Photosynthesis converts light energy");
});

test("older messages without sources do not crash", () => {
  const oldMessageWithoutSources = { id: "m-old", role: "assistant", content: "Old content" };
  const normalized = normalizeSources(oldMessageWithoutSources.sources);
  assert.deepEqual(normalized, []);
});

test("multiple sources render correctly", () => {
  const sources = [
    { quote: "Quote 1", startOffset: 0, endOffset: 7, startLine: 1, endLine: 1 },
    { quote: "Quote 2", startOffset: 8, endOffset: 15, startLine: 2, endLine: 3 }
  ];
  const normalized = normalizeSources(sources);
  assert.equal(normalized.length, 2);
  assert.equal(formatLineRange(normalized[0].startLine, normalized[0].endLine), "Line 1");
  assert.equal(formatLineRange(normalized[1].startLine, normalized[1].endLine), "Lines 2–3");
});
