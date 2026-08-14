import type { EditorView as CMView } from "@codemirror/view";
import type { Editor } from "@milkdown/kit/core";
import { useEditorStore } from "../stores/editorStore";

export type BlockKind =
  | "code"
  | "table"
  | "math"
  | "mermaid"
  | "quote"
  | "tasklist"
  | "bullet"
  | "ordered"
  | "hr"
  | "heading";

/** 光标应落点的标记：插入模板后把光标移到该偏移（相对模板开头），-1 表示末尾 */
export const BLOCK_TEMPLATES: Record<BlockKind, { text: string; caret: number }> = {
  code: { text: "```ts\n\n```\n", caret: 6 },
  table: { text: "| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n", caret: 3 },
  math: { text: "$$\n\n$$\n", caret: 3 },
  mermaid: { text: "```mermaid\nflowchart LR\n  A --> B\n```\n", caret: 22 },
  quote: { text: "> ", caret: 2 },
  tasklist: { text: "- [ ] ", caret: 6 },
  bullet: { text: "- ", caret: 2 },
  ordered: { text: "1. ", caret: 3 },
  hr: { text: "\n---\n\n", caret: -1 },
  heading: { text: "## ", caret: 3 },
};

/* ---------- 编辑器实例桥（由各编辑器组件注册/注销） ---------- */

let cmView: CMView | null = null;
let milkdownGet: (() => Editor | null) | null = null;

export function registerCmView(v: CMView | null) {
  cmView = v;
}

export function registerMilkdown(get: (() => Editor | null) | null) {
  milkdownGet = get;
}

function insertViaCodemirror(kind: BlockKind): boolean {
  if (!cmView) return false;
  const { text, caret } = BLOCK_TEMPLATES[kind];
  const pos = cmView.state.selection.main.to;
  const anchor = caret < 0 ? pos + text.length : pos + caret;
  cmView.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor },
    scrollIntoView: true,
  });
  cmView.focus();
  return true;
}

async function insertViaMilkdown(kind: BlockKind): Promise<boolean> {
  if (!milkdownGet) return false;
  const editor = milkdownGet();
  if (!editor) return false;
  const { text } = BLOCK_TEMPLATES[kind];
  const { editorViewCtx, parserCtx } = await import("@milkdown/kit/core");
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const parser = ctx.get(parserCtx);
    const doc = parser(text);
    if (!doc) return;
    const pos = view.state.selection.to;
    view.dispatch(view.state.tr.insert(pos, doc.content).scrollIntoView());
    view.focus();
  });
  return true;
}

/** 在当前激活的编辑器中插入块（按当前模式路由） */
export async function insertBlock(kind: BlockKind): Promise<boolean> {
  const mode = useEditorStore.getState().mode;
  if (mode === "source") return insertViaCodemirror(kind);
  if (mode === "wysiwyg") return insertViaMilkdown(kind);
  return false;
}
