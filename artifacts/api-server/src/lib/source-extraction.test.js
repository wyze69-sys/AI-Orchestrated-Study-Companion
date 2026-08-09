import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAndVerifyQuotes, extractVerifiedSources } from "./source-extraction.js";

const sampleDoc = `Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy.
The light energy is captured by chlorophyll pigments in chloroplasts.
Oxygen is released as a byproduct during this process.
Plants require carbon dioxide, water, and sunlight to perform photosynthesis.`;

test("valid quotes are returned with correct offsets and line numbers", () => {
  const jsonInput = JSON.stringify({
    quotes: [
      "convert light energy into chemical energy",
      "Oxygen is released as a byproduct",
    ],
  });

  const sources = parseAndVerifyQuotes(sampleDoc, jsonInput);

  assert.equal(sources.length, 2);
  assert.equal(sources[0].quote, "convert light energy into chemical energy");
  assert.equal(sources[0].startLine, 1);
  assert.equal(sources[1].quote, "Oxygen is released as a byproduct");
  assert.equal(sources[1].startLine, 3);
});

test("hallucinated quotes are discarded", () => {
  const jsonInput = JSON.stringify({
    quotes: [
      "convert light energy into chemical energy",
      "Mitochondria generate ATP for cellular respiration", // Hallucinated (not in doc)
      "Oxygen is released as a byproduct",
    ],
  });

  const sources = parseAndVerifyQuotes(sampleDoc, jsonInput);

  assert.equal(sources.length, 2);
  assert.equal(sources[0].quote, "convert light energy into chemical energy");
  assert.equal(sources[1].quote, "Oxygen is released as a byproduct");
});

test("duplicate quotes are removed", () => {
  const jsonInput = JSON.stringify({
    quotes: [
      "Oxygen is released as a byproduct",
      "  Oxygen is released as a byproduct  ", // Trimmed matches same offsets
      "Oxygen is released as a byproduct",
    ],
  });

  const sources = parseAndVerifyQuotes(sampleDoc, jsonInput);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].quote, "Oxygen is released as a byproduct");
});

test("maximum of 3 sources are returned", () => {
  const multiLineDoc = "Line one text.\nLine two text.\nLine three text.\nLine four text.\nLine five text.";
  const jsonInput = JSON.stringify({
    quotes: [
      "Line one text.",
      "Line two text.",
      "Line three text.",
      "Line four text.",
      "Line five text.",
    ],
  });

  const sources = parseAndVerifyQuotes(multiLineDoc, jsonInput);

  assert.equal(sources.length, 3);
  assert.equal(sources[0].quote, "Line one text.");
  assert.equal(sources[1].quote, "Line two text.");
  assert.equal(sources[2].quote, "Line three text.");
});

test("invalid JSON returns an empty list", () => {
  assert.deepEqual(parseAndVerifyQuotes(sampleDoc, "Not JSON at all"), []);
  assert.deepEqual(parseAndVerifyQuotes(sampleDoc, "{ quotes: invalid }"), []);
  assert.deepEqual(parseAndVerifyQuotes(sampleDoc, "{\"otherKey\": [\"quote\"]}"), []);
  assert.deepEqual(parseAndVerifyQuotes(sampleDoc, ""), []);
});

test("source extraction failure does not throw and returns empty list", async () => {
  const mockFailingAiClient = {
    models: {
      generateContent: async () => {
        throw new Error("AI service error / rate limit");
      },
    },
  };

  const sources = await extractVerifiedSources(sampleDoc, "Answer text", mockFailingAiClient);
  assert.deepEqual(sources, []);
});

test("source extraction handles valid AI response correctly", async () => {
  const mockSuccessAiClient = {
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          quotes: ["The light energy is captured by chlorophyll pigments in chloroplasts."],
        }),
      }),
    },
  };

  const sources = await extractVerifiedSources(sampleDoc, "Answer text", mockSuccessAiClient);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].quote, "The light energy is captured by chlorophyll pigments in chloroplasts.");
  assert.equal(sources[0].startLine, 2);
});
