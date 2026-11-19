import { invoke } from "@tauri-apps/api/core";
import type { OpenFile } from "../../stores/editorStore";
import { useLibraryStore, type TreeNode } from "../../stores/libraryStore";
import type { Citation } from "./types";

export interface ContextSource {
  index: number;
  path: string;
  kind: string;
}

export interface BuiltContext {
  /** 拼好的 <context> 片段 */
  text: string;
  sources: ContextSource[];
}

const MAX_DOC_CHARS = 26000;
const MAX_WORKSPACE_FILE_CHARS = 7000;
const MAX_WORKSPACE_FILES = 4;
const MAX_SCAN_FILES = 60;

/** 太长时保留开头与结尾：问「总结/查细节」都还能用，中间省略处明确标出 */
function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return `${text.slice(0, head)}\n\n…（此处省略 ${text.length - max} 个字符）…\n\n${text.slice(-tail)}`;
}

function flattenNotes(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.isDir) {
        if (node.children) walk(node.children);
      } else {
        out.push(node);
      }
    }
  };
  walk(nodes);
  return out;
}

/** 中文按 2 字切片 + 英文按词，用来给工作区文件打分做粗检索 */
export function questionTokens(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? [];
  const cjk = question.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const grams: string[] = [];
  for (const run of cjk) {
    for (let i = 0; i < run.length - 1; i++) grams.push(run.slice(i, i + 2));
  }
  const tokens = [...new Set([...words, ...grams])];
  return tokens.slice(0, 32);
}

function scoreText(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    const hits = lower.split(token).length - 1;
    if (hits > 0) score += Math.min(hits, 6);
  }
  return score;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

interface WorkspaceDoc {
  path: string;
  label: string;
  text: string;
  score: number;
}

/** 在工作区里按问题关键词挑几篇最相关的笔记（没有关键词时取文件树里的前几篇） */
async function pickWorkspaceDocs(question: string): Promise<WorkspaceDoc[]> {
  const { tree, root } = useLibraryStore.getState();
  if (!root) return [];
  const files = flattenNotes(tree).slice(0, MAX_SCAN_FILES);
  if (files.length === 0) return [];

  const tokens = questionTokens(question);
  const nameScored = files
    .map((file) => ({ file, nameScore: scoreText(file.name, tokens) }))
    .sort((a, b) => b.nameScore - a.nameScore);

  const candidates = nameScored.slice(0, MAX_SCAN_FILES).map((entry) => entry.file);
  const read = await mapLimit(candidates, 6, async (file) => {
    try {
      const text = await invoke<string>("read_text", { path: file.path });
      return { path: file.path, label: file.name, text, nameScore: scoreText(file.name, tokens) };
    } catch {
      return null;
    }
  });

  return read
    .filter((item): item is { path: string; label: string; text: string; nameScore: number } => item !== null)
    .map((item) => ({
      ...item,
      score: item.nameScore * 8 + scoreText(item.text.slice(0, 20000), tokens),
    }))
    .filter((item) => item.score > 0 || tokens.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_WORKSPACE_FILES);
}

export interface BuildContextOptions {
  scope: "doc" | "workspace";
  question: string;
  file: OpenFile | null;
  citations: Citation[];
}

export async function buildContext(options: BuildContextOptions): Promise<BuiltContext> {
  const { scope, question, file, citations } = options;
  const blocks: string[] = [];
  const sources: ContextSource[] = [];
  const push = (path: string, label: string, kind: string, body: string) => {
    const index = sources.length + 1;
    sources.push({ index, path, kind });
    blocks.push(
      `<context index="${index}" kind="${kind}" path="${path.replace(/"/g, "'")}" name="${label.replace(/"/g, "'")}">\n${body.trim()}\n</context>`,
    );
  };

  // 用户显式添加的引用优先
  for (const citation of citations) {
    if (citation.kind === "document" && file && citation.path === file.path) continue;
    push(citation.path, citation.label, citation.kind === "selection" ? "selection" : "reference", citation.text);
  }

  if (scope === "doc") {
    if (file) {
      push(file.path, file.name, "document", truncateMiddle(file.content, MAX_DOC_CHARS));
    }
  } else {
    const docs = await pickWorkspaceDocs(question);
    for (const doc of docs) {
      push(doc.path, doc.label, "workspace", truncateMiddle(doc.text, MAX_WORKSPACE_FILE_CHARS));
    }
    // 工作区模式下，当前打开的文档通常仍然相关，排在最后补上
    if (file) {
      push(file.path, file.name, "document", truncateMiddle(file.content, MAX_WORKSPACE_FILE_CHARS));
    }
  }

  return { text: blocks.join("\n\n"), sources };
}
