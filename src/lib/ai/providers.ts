import type { AiConfig, AiProvider, ChatTurn } from "./types";

export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** 各家 baseUrl 的写法不一样：Anthropic 系一律带 /v1，兼容网关（如 DeepSeek）常给成 …/anthropic */
function anthropicEndpoint(base: string): string {
  if (/\/v\d+$/.test(base)) return `${base}/messages`;
  return `${base}/v1/messages`;
}

/** 按各家协议拼请求；baseUrl 允许用户改成代理 / 兼容网关 */
export function buildChatRequest(config: AiConfig, system: string, turns: ChatTurn[]): HttpRequest {
  const base = config.baseUrl.trim().replace(/\/+$/, "");

  if (config.provider === "anthropic") {
    return {
      url: anthropicEndpoint(base),
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        // 浏览器上下文直连需要这个头；在 Tauri 里走 Rust 请求则无所谓
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: config.model,
        system,
        messages: turns.map((t) => ({ role: t.role, content: t.content })),
        max_tokens: 8192,
        temperature: config.temperature,
        stream: true,
      }),
    };
  }

  return {
    url: `${base}/chat/completions`,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "system", content: system }, ...turns],
      temperature: config.temperature,
      stream: true,
    }),
  };
}

interface OpenAiChunk {
  choices?: { delta?: { content?: string }; message?: { content?: string } }[];
}
interface AnthropicChunk {
  type?: string;
  delta?: { text?: string };
}

function extractDelta(provider: AiProvider, json: unknown): string {
  if (provider === "anthropic") {
    const data = json as AnthropicChunk;
    if (data.type === "content_block_delta") return data.delta?.text ?? "";
    return "";
  }
  const data = json as OpenAiChunk;
  return data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content ?? "";
}

export interface SseParser {
  /** 喂入一段原始响应文本，返回新增的回答增量 */
  push(chunk: string): string;
  /** 响应结束时把残留的未换行内容也处理掉 */
  flush(): string;
  readonly finished: boolean;
}

/**
 * SSE 增量解析：网络分片会把一行 data: 劈开，所以必须自己攒缓冲。
 * 只关心 `data:` 行，event/id/retry 一律忽略。
 */
export function createSseParser(provider: AiProvider): SseParser {
  let buffer = "";
  let finished = false;

  const consumeLine = (rawLine: string): string => {
    const line = rawLine.replace(/\r$/, "");
    if (!line.startsWith("data:")) return "";
    const payload = line.slice(5).trim();
    if (!payload) return "";
    if (payload === "[DONE]") {
      finished = true;
      return "";
    }
    if (!payload.startsWith("{")) return "";
    try {
      return extractDelta(provider, JSON.parse(payload));
    } catch {
      return "";
    }
  };

  return {
    push(chunk: string): string {
      buffer += chunk;
      let out = "";
      let idx = buffer.indexOf("\n");
      while (idx >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        out += consumeLine(line);
        idx = buffer.indexOf("\n");
      }
      return out;
    },
    flush(): string {
      const rest = buffer;
      buffer = "";
      return rest ? consumeLine(rest) : "";
    },
    get finished() {
      return finished;
    },
  };
}
