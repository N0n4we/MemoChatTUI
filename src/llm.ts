import type { ChatMessage, ChatResponse, LlmConfig, StreamCallbacks } from "./types.ts";

interface OpenAiChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning?: string;
      reasoning_content?: string;
    };
    message?: {
      content?: string;
      reasoning?: string;
      reasoning_content?: string;
    };
  }>;
}

export async function chatCompletion(
  history: ChatMessage[],
  config: LlmConfig,
  callbacks: StreamCallbacks = {},
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const model = config.modelId || "z-ai/glm-5";
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: history,
          stream: true,
          reasoning: { enabled: config.reasoningEnabled, exclude: false },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API Error ${response.status}: ${text}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return parseJsonResponse(await response.json(), callbacks);
      }

      if (!response.body) throw new Error("API response has no body");
      return await parseEventStream(response.body, callbacks);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(1000 * (attempt + 1));
    }
  }

  throw lastError;
}

async function parseEventStream(body: ReadableStream<Uint8Array>, callbacks: StreamCallbacks): Promise<ChatResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data) as OpenAiChunk;
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          callbacks.onContent?.(delta.content);
        }

        const reasoningChunk = delta?.reasoning_content || delta?.reasoning || "";
        if (reasoningChunk) {
          reasoning += reasoningChunk;
          callbacks.onReasoning?.(reasoningChunk);
        }
      } catch {
        // Ignore malformed stream fragments.
      }
    }
  }

  return { role: "assistant", content, reasoning };
}

function parseJsonResponse(value: unknown, callbacks: StreamCallbacks): ChatResponse {
  const parsed = value as OpenAiChunk;
  const message = parsed.choices?.[0]?.message;
  const content = message?.content || "";
  const reasoning = message?.reasoning_content || message?.reasoning || "";
  if (content) callbacks.onContent?.(content);
  if (reasoning) callbacks.onReasoning?.(reasoning);
  return { role: "assistant", content, reasoning };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
