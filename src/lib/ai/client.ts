import { buildChatRequest, createSseParser, type HttpRequest } from "./providers";
import type { AiConfig, ChatTurn } from "./types";
import type { UnlistenFn } from "@tauri-apps/api/event";

export class AiCancelledError extends Error {
  constructor() {
    super("已取消");
    this.name = "AiCancelledError";
  }
}

export function hasTauri(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

export interface StreamOptions {
  config: AiConfig;
  system: string;
  turns: ChatTurn[];
  onDelta?: (delta: string) => void;
  /** 交给调用方一个「停止」函数（会 abort 请求 / 通知 Rust 取消） */
  onAbortHandle?: (abort: () => void) => void;
}

/**
 * 桌面端走 Rust 的流式转发：WebView2 里直接 fetch 第三方 API 会被 CORS 拦，
 * 而且把 API Key 放在页面上下文里也不合适。
 */
async function streamTauri(request: HttpRequest, options: StreamOptions): Promise<string> {
  const core = await import("@tauri-apps/api/core");
  const events = await import("@tauri-apps/api/event");

  const id = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const parser = createSseParser(options.config.provider);
  let text = "";

  const unlisteners: UnlistenFn[] = [];
  let settled = false;
  let resolveDone: (v: string) => void = () => {};
  let rejectDone: (e: Error) => void = () => {};
  const done = new Promise<string>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  const cleanup = () => {
    for (const un of unlisteners.splice(0)) {
      try {
        un();
      } catch {
        /* 已经卸载 */
      }
    }
  };

  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (error) rejectDone(error);
    else resolveDone(text);
  };

  unlisteners.push(
    await events.listen<{ id: string; data: string }>("ai:chunk", (e) => {
      if (e.payload.id !== id) return;
      const delta = parser.push(e.payload.data);
      if (delta) {
        text += delta;
        options.onDelta?.(delta);
      }
    }),
    await events.listen<{ id: string }>("ai:done", (e) => {
      if (e.payload.id !== id) return;
      const tail = parser.flush();
      if (tail) {
        text += tail;
        options.onDelta?.(tail);
      }
      finish();
    }),
    await events.listen<{ id: string }>("ai:cancelled", (e) => {
      if (e.payload.id !== id) return;
      finish(new AiCancelledError());
    }),
    await events.listen<{ id: string; message: string }>("ai:error", (e) => {
      if (e.payload.id !== id) return;
      finish(new Error(e.payload.message));
    }),
  );

  options.onAbortHandle?.(() => {
    void core.invoke("ai_cancel", { id }).catch(() => {});
    finish(new AiCancelledError());
  });

  void core
    .invoke("ai_stream", {
      id,
      url: request.url,
      headers: request.headers,
      body: request.body,
    })
    .catch((e: unknown) => finish(new Error(String(e))));

  return done;
}

/** 浏览器预览（无 Tauri）时的直连实现；多数官方 API 会被 CORS 拒绝 */
async function streamBrowser(request: HttpRequest, options: StreamOptions): Promise<string> {
  const controller = new AbortController();
  options.onAbortHandle?.(() => controller.abort());

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) throw new AiCancelledError();
    throw new Error(
      `请求失败：${String(e)}\n浏览器预览无法直连 AI API（CORS 限制），请在桌面应用里使用。`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}：${detail.slice(0, 500)}`);
  }
  if (!response.body) throw new Error("响应没有内容");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(options.config.provider);
  let text = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const delta = parser.push(decoder.decode(value, { stream: true }));
      if (delta) {
        text += delta;
        options.onDelta?.(delta);
      }
    }
  } catch (e) {
    if (controller.signal.aborted) throw new AiCancelledError();
    throw e;
  }

  const tail = parser.flush();
  if (tail) {
    text += tail;
    options.onDelta?.(tail);
  }
  return text;
}

/** 流式对话，返回完整回答文本 */
export async function streamChat(options: StreamOptions): Promise<string> {
  const request = buildChatRequest(options.config, options.system, options.turns);
  return hasTauri() ? streamTauri(request, options) : streamBrowser(request, options);
}

/** 配置页的「测试连接」：发一句最短的请求，确认 Key / 模型 / 网络可用 */
export async function testConnection(config: AiConfig): Promise<string> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("连接超时（30 秒）")), 30000);
  });
  try {
    const reply = await Promise.race([
      streamChat({
        config,
        system: "你是一个连通性测试助手。",
        turns: [{ role: "user", content: "只回复 ok" }],
      }),
      timeout,
    ]);
    return reply.trim();
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}
