const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "z-ai/glm-5.2";

function getNvidiaConfig() {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.NVIDIA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.NVIDIA_MODEL || DEFAULT_MODEL,
  };
}

function toOpenAiMessages(systemInstruction, contents) {
  return [
    { role: "system", content: systemInstruction },
    ...contents.map((item) => ({
      role: item.role === "model" ? "assistant" : item.role,
      content: item.parts?.map((part) => part.text || "").join("") || "",
    })),
  ];
}

export async function createNvidiaChatStream({ systemInstruction, contents, signal }) {
  const config = getNvidiaConfig();
  if (!config) {
    const error = new Error("NVIDIA_API_KEY is not configured");
    error.code = "NVIDIA_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: config.model,
      messages: toOpenAiMessages(systemInstruction, contents),
      temperature: 1,
      top_p: 1,
      max_tokens: 8192,
      stream: true,
      seed: 42,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    const error = new Error(`NVIDIA request failed with ${response.status}: ${body.slice(0, 500)}`);
    error.status = response.status;
    throw error;
  }

  return parseSseText(response.body);
}

async function* parseSseText(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        const parsed = JSON.parse(payload);
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) yield text;
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

export function isNvidiaConfigured() {
  return Boolean(process.env.NVIDIA_API_KEY?.trim());
}
