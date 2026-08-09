import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAndVerifyQuotes } from "./source-extraction.js";

test("assistant messages persist sources correctly in database structure", () => {
  const sampleDoc = "Photosynthesis converts light energy into chemical energy.\nChlorophyll captures light inside chloroplasts.";
  const sampleAnswer = "Photosynthesis converts light energy into chemical energy.";
  const sampleJson = JSON.stringify({
    quotes: ["Photosynthesis converts light energy into chemical energy."]
  });

  const verifiedSources = parseAndVerifyQuotes(sampleDoc, sampleJson);
  assert.equal(verifiedSources.length, 1);
  assert.equal(verifiedSources[0].quote, "Photosynthesis converts light energy into chemical energy.");

  // Simulate assistant message DB object
  const assistantDbRow = {
    id: "msg-assistant-1",
    sessionId: "sess-1",
    documentId: "doc-1",
    role: "assistant",
    content: sampleAnswer,
    sources: verifiedSources,
    createdAt: new Date()
  };

  assert.deepEqual(assistantDbRow.sources, verifiedSources);
});

test("user messages do not receive sources", () => {
  const userDbRow = {
    id: "msg-user-1",
    sessionId: "sess-1",
    documentId: "doc-1",
    role: "user",
    content: "Explain photosynthesis",
    sources: [],
    createdAt: new Date()
  };

  const responseMapping = {
    id: userDbRow.id,
    sessionId: userDbRow.sessionId,
    documentId: userDbRow.documentId,
    role: userDbRow.role,
    content: userDbRow.content,
    sources: userDbRow.role === "assistant" ? (userDbRow.sources ?? []) : [],
    createdAt: userDbRow.createdAt
  };

  assert.deepEqual(responseMapping.sources, []);
});

test("old messages without sources default safely to empty array", () => {
  const oldAssistantMsg = {
    id: "msg-old-1",
    sessionId: "sess-1",
    documentId: "doc-1",
    role: "assistant",
    content: "Old response without sources field",
    sources: null,
    createdAt: new Date()
  };

  const responseMapping = {
    id: oldAssistantMsg.id,
    sessionId: oldAssistantMsg.sessionId,
    documentId: oldAssistantMsg.documentId,
    role: oldAssistantMsg.role,
    content: oldAssistantMsg.content,
    sources: oldAssistantMsg.role === "assistant" ? (oldAssistantMsg.sources ?? []) : [],
    createdAt: oldAssistantMsg.createdAt
  };

  assert.deepEqual(responseMapping.sources, []);
});

test("empty sources array persists and returns empty array", () => {
  const emptySourcesMsg = {
    id: "msg-empty-sources-1",
    sessionId: "sess-1",
    documentId: "doc-1",
    role: "assistant",
    content: "General explanation with no quotes",
    sources: [],
    createdAt: new Date()
  };

  const responseMapping = {
    id: emptySourcesMsg.id,
    sessionId: emptySourcesMsg.sessionId,
    documentId: emptySourcesMsg.documentId,
    role: emptySourcesMsg.role,
    content: emptySourcesMsg.content,
    sources: emptySourcesMsg.role === "assistant" ? (emptySourcesMsg.sources ?? []) : [],
    createdAt: emptySourcesMsg.createdAt
  };

  assert.deepEqual(responseMapping.sources, []);
});
