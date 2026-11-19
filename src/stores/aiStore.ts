import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_CONFIG,
  type AiConfig,
  type ChatMessage,
  type ChatTurn,
  type Citation,
  type Proposal,
} from "../lib/ai/types";
import { AiCancelledError, streamChat } from "../lib/ai/client";
import { buildContext } from "../lib/ai/context";
import { applyDiff, diffText } from "../lib/ai/diff";
import { parseProposals } from "../lib/ai/proposal";
import { buildSystemPrompt, buildUserMessage } from "../lib/ai/prompt";
import { useEditorStore } from "./editorStore";
import { scheduleAutosave } from "../lib/autosave";
import { useLibraryStore } from "./libraryStore";

const CONFIG_KEY = "markly:ai-config";
const OPEN_KEY = "markly:ai-open";

function newId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const saved = JSON.parse(raw) as Partial<AiConfig>;
    return { ...DEFAULT_CONFIG, ...saved };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 路径比较：忽略大小写与分隔符差异 */
function normalize(path: string): string {
  return path.replace(/\//g, "\\").toLowerCase();
}

function isSamePath(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

/** 模型可能只回相对路径，按当前文档目录补全 */
function absoluteTarget(path: string | null): string | null {
  const file = useEditorStore.getState().file;
  if (!path) return file?.path ?? null;
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\")) return path;
  if (!file) return path;
  return `${file.dir}${file.dir.endsWith("\\") || file.dir.endsWith("/") ? "" : "\\"}${path}`;
}

/** 右上角「停止」按钮要用；放模块级避免进 store 触发无谓渲染 */
let currentAbort: (() => void) | null = null;

/** 右键「添加到 AI 引用」等地方复用 */
export function buildCitation(input: {
  path: string;
  label: string;
  text: string;
  kind: Citation["kind"];
}): Citation {
  return {
    id: newId(),
    path: input.path,
    label: input.label,
    text: input.text.trim().slice(0, 6000),
    kind: input.kind,
  };
}

/** 读取正文里当前选中的文字（选区在正文/编辑器内才算） */
export function readDomSelection(): Citation | null {
  if (typeof window === "undefined") return null;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  const node = selection.anchorNode;
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  if (!el || !el.closest(".markdown-body, .milkdown-doc, .cm-content")) return null;
  const file = useEditorStore.getState().file;
  return buildCitation({
    path: file?.path ?? "",
    label: file ? `${file.name} · 选区` : "选区",
    text: text.slice(0, 6000),
    kind: "selection",
  });
}

const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, dt, dd";

/**
 * 没有选中文字时，取右键位置所在「段落」的文字作为引用。
 * 这样在正文任意位置右键都能把这一段交给 AI，不用先精确选中。
 */
export function readBlockCitation(target: Element | null): Citation | null {
  if (!target) return null;
  const body = target.closest(".markdown-body, .milkdown-doc, .cm-content");
  if (!body) return null;
  const block = target.closest(BLOCK_SELECTOR) as HTMLElement | null;
  // innerText 在部分环境（jsdom）不存在，回退到 textContent
  const text = (block?.innerText ?? block?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const file = useEditorStore.getState().file;
  return buildCitation({
    path: file?.path ?? "",
    label: file ? `${file.name} · 段落` : "段落",
    text: text.slice(0, 6000),
    kind: "block",
  });
}

interface AiState {
  open: boolean;
  settingsOpen: boolean;
  config: AiConfig;
  scope: "doc" | "workspace";
  messages: ChatMessage[];
  citations: Citation[];
  draft: string;
  streaming: boolean;
  status: string | null;
  error: string | null;
  proposal: Proposal | null;

  toggle: () => void;
  setOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  saveConfig: (config: AiConfig) => void;
  setScope: (scope: "doc" | "workspace") => void;
  setDraft: (draft: string) => void;
  addCitation: (citation: Citation) => void;
  addCurrentDocument: () => void;
  removeCitation: (id: string) => void;
  clearCitations: () => void;
  clearMessages: () => void;
  send: () => Promise<void>;
  stop: () => void;
  setProposal: (proposal: Proposal | null) => void;
  applyProposal: (accepted: Set<number>) => Promise<void>;
}

export const useAiStore = create<AiState>((set, get) => ({
  open: localStorage.getItem(OPEN_KEY) === "1",
  settingsOpen: false,
  config: loadConfig(),
  scope: "doc",
  messages: [],
  citations: [],
  draft: "",
  streaming: false,
  status: null,
  error: null,
  proposal: null,

  toggle: () => get().setOpen(!get().open),
  setOpen: (open) => {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    set({ open });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  saveConfig: (config) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    set({ config, error: null });
  },
  setScope: (scope) => set({ scope }),
  setDraft: (draft) => set({ draft }),

  addCitation: (citation) => {
    const exists = get().citations.some(
      (c) => c.path === citation.path && c.text.slice(0, 200) === citation.text.slice(0, 200),
    );
    if (exists) {
      set({ open: true });
      return;
    }
    set((s) => ({ citations: [...s.citations, citation], open: true, error: null }));
    localStorage.setItem(OPEN_KEY, "1");
  },

  addCurrentDocument: () => {
    const file = useEditorStore.getState().file;
    if (!file) return;
    get().addCitation(
      buildCitation({
        path: file.path,
        label: file.name,
        text: file.content,
        kind: "document",
      }),
    );
  },

  removeCitation: (id) => set((s) => ({ citations: s.citations.filter((c) => c.id !== id) })),
  clearCitations: () => set({ citations: [] }),
  clearMessages: () => set({ messages: [], error: null, proposal: null }),

  stop: () => {
    currentAbort?.();
    currentAbort = null;
  },

  setProposal: (proposal) => set({ proposal }),

  send: async () => {
    const state = get();
    if (state.streaming) return;

    const question = state.draft.trim();
    if (!question) return;

    if (!state.config.apiKey.trim()) {
      set({ settingsOpen: true, error: "请先填写 API Key（配置只保存在本机）" });
      return;
    }

    // 正文里有选区时自动作为引用，省得手动右键
    const citations = [...state.citations];
    const selection = readDomSelection();
    if (selection) citations.push(selection);

    const userMessage: ChatMessage = {
      id: newId(),
      role: "user",
      content: question,
      citations,
    };
    const assistantId = newId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      citations: [],
    };

    set({
      messages: [...state.messages, userMessage, assistantMessage],
      draft: "",
      citations: [],
      streaming: true,
      status: "正在整理上下文…",
      error: null,
    });

    try {
      const file = useEditorStore.getState().file;
      const context = await buildContext({ scope: state.scope, question, file, citations });
      set({ status: "正在等待模型回复…" });

      const turns: ChatTurn[] = [...state.messages, userMessage]
        .filter((message) => message.content.trim().length > 0 && !message.error)
        .slice(-8)
        .map((message) => ({ role: message.role, content: message.content }));
      turns[turns.length - 1] = {
        role: "user",
        content: buildUserMessage(question, context.text),
      };

      let reply = "";
      currentAbort = null;
      try {
        reply = await streamChat({
          config: state.config,
          system: buildSystemPrompt(),
          turns,
          onDelta: (delta) => {
            set((s) => ({
              messages: s.messages.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            }));
          },
          onAbortHandle: (abort) => {
            currentAbort = abort;
          },
        });
      } finally {
        currentAbort = null;
      }

      const proposals = parseProposals(reply);
      const latestFile = useEditorStore.getState().file;
      let proposal: Proposal | null = null;

      if (proposals.length > 0) {
        const matched =
          proposals.find((item) => {
            const target = absoluteTarget(item.path);
            return !!target && !!latestFile && isSamePath(target, latestFile.path);
          }) ?? proposals[0];
        const targetPath = absoluteTarget(matched.path);
        if (targetPath) {
          let before = "";
          if (latestFile && isSamePath(targetPath, latestFile.path)) {
            before = latestFile.content;
          } else {
            try {
              before = await invoke<string>("read_text", { path: targetPath });
            } catch {
              before = "";
            }
          }
          const { ops, hunks } = diffText(before, matched.content);
          proposal = { path: targetPath, before, after: matched.content, ops, hunks };
        }
      }

      set((s) => ({
        messages: s.messages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                proposalPaths: proposals.map((item) => absoluteTarget(item.path) ?? "").filter(Boolean),
                proposal: proposal ?? undefined,
              }
            : message,
        ),
        streaming: false,
        status: null,
        proposal,
      }));
    } catch (error) {
      const cancelled = error instanceof AiCancelledError;
      const message = cancelled ? "已停止生成" : error instanceof Error ? error.message : String(error);
      set((s) => ({
        streaming: false,
        status: null,
        error: cancelled ? null : message,
        messages: s.messages.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: item.content || (cancelled ? "（已停止）" : ""),
                error: cancelled ? undefined : message,
              }
            : item,
        ),
      }));
    }
  },

  applyProposal: async (accepted) => {
    const proposal = get().proposal;
    if (!proposal) return;

    const content = applyDiff(proposal.ops, accepted);
    const file = useEditorStore.getState().file;

    if (file && isSamePath(file.path, proposal.path)) {
      const next = { ...file, content };
      useEditorStore.getState().applyContent(content);
      // 手改的内容也走同一条自动保存管线
      scheduleAutosave(next, content);
    } else {
      await invoke("write_text", { path: proposal.path, content });
      if (useLibraryStore.getState().root) await useLibraryStore.getState().refresh();
    }

    set({ proposal: null });
  },
}));
