import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import { katex } from "@mdit/plugin-katex";
import { highlightCode, isHighlighterReady } from "./shiki";

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
});

md.use(footnote);
md.use(taskLists, { enabled: false, label: true });
md.use(katex, { output: "html" });

/* ---------- 标题 ID ---------- */

function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}\-_]/gu, "") || "heading"
  );
}

const seenSlugs = new Map<string, number>();

export function resetSlugs() {
  seenSlugs.clear();
}

function uniqueSlug(text: string): string {
  const base = slugify(text);
  const n = seenSlugs.get(base) ?? 0;
  seenSlugs.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

const defaultHeadingRule =
  md.renderer.rules.heading_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const text = tokens[idx + 1]?.content ?? "";
  const prevAttrs = token.attrs ?? [];
  token.attrs = [
    ...prevAttrs.filter(([k]) => k !== "id"),
    ["id", uniqueSlug(text)],
  ];
  return defaultHeadingRule(tokens, idx, options, env, self);
};

/* ---------- 块级元素源码行号（滚动同步用） ---------- */

const LINE_TYPES = new Set([
  "paragraph_open",
  "heading_open",
  "blockquote_open",
  "bullet_list_open",
  "ordered_list_open",
  "table_open",
  "hr",
]);

for (const type of LINE_TYPES) {
  const rule =
    md.renderer.rules[type] ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules[type] = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.map) token.attrSet("data-source-line", String(token.map[0]));
    return rule(tokens, idx, options, env, self);
  };
}

/* ---------- 代码高亮 + Mermaid ---------- */

function isDarkMode(): boolean {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" || t === "midnight";
}

const defaultFenceRule =
  md.renderer.rules.fence ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = (token.info || "").trim().split(/\s+/)[0].toLowerCase();
  const line = token.map ? token.map[0] : -1;
  const lineAttr = line >= 0 ? ` data-source-line="${line}"` : "";

  if (lang === "mermaid") {
    const source = md.utils.escapeHtml(token.content);
    return `<div class="mermaid-block"${lineAttr}><pre class="mermaid-source" style="display:none">${source}</pre></div>`;
  }

  if (isHighlighterReady() && lang) {
    try {
      const html = highlightCode(token.content, lang, isDarkMode());
      return html.replace(/^<pre([^>]*)>/, `<pre$1${lineAttr}>`);
    } catch {
      /* 高亮失败回退默认渲染 */
    }
  }

  return defaultFenceRule(tokens, idx, options, env, self);
};

/* ---------- 入口 ---------- */

export function renderMarkdown(source: string): string {
  resetSlugs();
  return md.render(source);
}

export { slugify };
