import contentCss from "../../styles/content.css?raw";
import { renderMarkdown } from "./renderer";
import { renderMermaidBlocks } from "./mermaid";
import { ensureHighlighter } from "./shiki";
import { katexFontCss } from "./katexFonts";
import { imageSourceOf, resolveLocalPath } from "./assets";
import { invoke } from "@tauri-apps/api/core";
import { basename } from "@tauri-apps/api/path";

const KATEX_CSS_EXCLUDE_FONTS = true; // 字体单独内嵌

async function loadKatexCss(): Promise<string> {
  const css = (await import("katex/dist/katex.min.css?raw")).default;
  if (KATEX_CSS_EXCLUDE_FONTS) {
    // 去掉相对路径的 @font-face（已由 katexFontCss 内嵌替代）
    return css.replace(/@font-face\{[^}]*url\(fonts[^}]*\)\}/g, "");
  }
  return css;
}

/** 收集当前主题的所有 CSS 变量，导出文档保持主题一致 */
function themeVariablesCss(): string {
  const style = getComputedStyle(document.documentElement);
  const vars: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    if (prop.startsWith("--")) {
      vars.push(`  ${prop}: ${style.getPropertyValue(prop).trim()};`);
    }
  }
  return `:root {\n${vars.join("\n")}\n}`;
}

/** 将本地图片内联为 base64（经 Rust 命令读取，不受 fs 插件作用域限制） */
async function inlineImages(container: HTMLElement, dir: string | null) {
  const imgs = container.querySelectorAll("img");
  await Promise.all(
    Array.from(imgs).map(async (img) => {
      // 渲染阶段已把可解析的地址换成 asset URL 并保留原文到 data-src，
      // 这里必须用原始地址还原绝对路径，否则会把 asset URL 当成本地路径。
      const src = imageSourceOf(img);
      if (!src) return;
      const abs = resolveLocalPath(src, dir);
      if (!abs) return; // 远程图片 / data URI 保持原样
      try {
        const raw = await invoke<ArrayBuffer | number[]>("read_binary", { path: abs });
        const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : Uint8Array.from(raw);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const ext = abs.split(".").pop()?.toLowerCase() ?? "png";
        const mime = ext === "jpg" ? "jpeg" : ext === "svg" ? "svg+xml" : ext;
        img.setAttribute("src", `data:image/${mime};base64,${btoa(binary)}`);
      } catch {
        /* 图片缺失时保留原样 */
      }
    }),
  );
}

export interface ExportOptions {
  markdown: string;
  dir: string | null;
  title?: string;
  autoPrint?: boolean;
}

/** 渲染为自包含 HTML 文档字符串 */
export async function renderDocumentToHtml(opts: ExportOptions): Promise<string> {
  await ensureHighlighter();
  const container = document.createElement("div");
  container.innerHTML = renderMarkdown(opts.markdown, { baseDir: opts.dir });
  await renderMermaidBlocks(container);
  await inlineImages(container, opts.dir);

  const title = opts.title ?? "Markly 文档";
  const themeCss = themeVariablesCss();
  const [katexCss, fontCss] = await Promise.all([loadKatexCss(), katexFontCss()]);
  const printScript = opts.autoPrint
    ? `<script>window.addEventListener("load",()=>{setTimeout(()=>window.print(),300)});</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
${themeCss}
${fontCss}
${katexCss}
${contentCss}
body{margin:0;background:var(--bg);overflow:auto;user-select:text}
.markdown-body{padding-top:56px}
@media print{
  .markdown-body{max-width:none;padding:0}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1,h2,h3{break-after:avoid}
  pre,table,.mermaid-block{break-inside:avoid}
}
</style>
</head>
<body>
<div class="markdown-body">${container.innerHTML}</div>
${printScript}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export async function suggestExportName(path: string): Promise<string> {
  return (await basename(path)).replace(/\.(md|markdown|mdown|mkd)$/i, "");
}
