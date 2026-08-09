import assert from "node:assert/strict";
import test from "node:test";
import { createNvidiaChatStream, isNvidiaConfigured } from "./nvidia-chat.js";

test("NVIDIA provider is optional when no API key is configured", () => {
  const previous = process.env.NVIDIA_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  try {
    assert.equal(isNvidiaConfigured(), false);
    return assert.rejects(
      () => createNvidiaChatStream({ systemInstruction: "system", contents: [], signal: undefined }),
      (error) => error.code === "NVIDIA_NOT_CONFIGURED",
    );
  } finally {
    if (previous === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previous;
  }
});

test("NVIDIA provider parses OpenAI-compatible SSE content", async () => {
  const previousKey = process.env.NVIDIA_API_KEY;
  const previousBaseUrl = process.env.NVIDIA_BASE_URL;
  const previousModel = process.env.NVIDIA_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.NVIDIA_API_KEY = "test-key";
  process.env.NVIDIA_BASE_URL = "https://example.test/v1";
  process.env.NVIDIA_MODEL = "test-model";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://example.test/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    return new Response(
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  };
  try {
    const stream = await createNvidiaChatStream({
      systemInstruction: "system",
      contents: [{ role: "user", parts: [{ text: "question" }] }],
      signal: undefined,
    });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(chunks, ["hello", " world"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previousKey;
    if (previousBaseUrl === undefined) delete process.env.NVIDIA_BASE_URL;
    else process.env.NVIDIA_BASE_URL = previousBaseUrl;
    if (previousModel === undefined) delete process.env.NVIDIA_MODEL;
    else process.env.NVIDIA_MODEL = previousModel;
  }
});
