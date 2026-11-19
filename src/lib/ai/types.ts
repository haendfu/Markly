import type { DiffHunk, DiffLineOp } from "./diff";

export type AiProvider = "openai" | "anthropic";

export interface AiConfig {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  model: string;
}

export const PROVIDER_PRESETS: Record<AiProvider, ProviderPreset> = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  anthropic: {
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
  },
};

export const DEFAULT_CONFIG: AiConfig = {
  provider: "openai",
  baseUrl: PROVIDER_PRESETS.openai.baseUrl,
  model: PROVIDER_PRESETS.openai.model,
  apiKey: "",
  temperature: 0.3,
};

export type CitationKind = "selection" | "block" | "document" | "workspace" | "manual";

export interface Citation {
  id: string;
  path: string;
  label: string;
  text: string;
  kind: CitationKind;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatMessage extends ChatTurn {
  id: string;
  citations: Citation[];
  error?: string;
  /** 该条回答里可以被应用的文件修改 */
  proposalPaths?: string[];
  /** 这条回答附带的修改建议快照，供「查看修改建议」再次打开 */
  proposal?: Proposal;
}

/** 一次「AI 改文档」提案：原文 + 模型给出的新文本 + 行级 diff */
export interface Proposal {
  path: string;
  before: string;
  after: string;
  ops: DiffLineOp[];
  hunks: DiffHunk[];
}
