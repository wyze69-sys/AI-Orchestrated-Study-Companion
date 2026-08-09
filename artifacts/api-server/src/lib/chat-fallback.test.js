import test from "node:test";
import assert from "node:assert/strict";
import { createGroundedChatFallback } from "./chat-fallback.js";

const documentContent = "Photosynthesis converts light energy into chemical energy.\nChlorophyll captures light inside chloroplasts.\nOxygen is released as a byproduct.";

test("chat fallback returns only verified document sources for a relevant prompt", () => {
  const fallback = createGroundedChatFallback(documentContent, "Explain how photosynthesis works");

  assert.equal(fallback.sources.length, 3);
  assert.equal(fallback.sources[0].quote, "Photosynthesis converts light energy into chemical energy.");
  assert.match(fallback.content, /temporarily unavailable/i);
});

test("chat fallback leaves sources empty for a prompt unrelated to the document", () => {
  const fallback = createGroundedChatFallback(documentContent, "What is the capital of France?");

  assert.deepEqual(fallback.sources, []);
  assert.match(fallback.content, /cannot verify an answer/i);
});
