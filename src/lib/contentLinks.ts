import { openUrl } from "@tauri-apps/plugin-opener";
import { readMarkdownFile } from "./tauri/files";
import { joinPath } from "../stores/libraryStore";
import { useEditorStore } from "../stores/editorStore";

/**
 * 内容区链接点击统一处理：
 * - 外部 http(s)：系统浏览器打开
 * - 锚点 #xxx：平滑滚动
 * - 相对 .md 链接：直接打开对应笔记
 */
export function handleContentClick(e: MouseEvent, container: HTMLElement) {
  const anchor = (e.target as HTMLElement).closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href") ?? "";
  if (!href) return;

  if (href.startsWith("#")) {
    e.preventDefault();
    const target = container.querySelector(
      `#${CSS.escape(href.slice(1))}`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (/^(https?:|mailto:)/i.test(href)) {
    e.preventDefault();
    openUrl(href).catch(console.error);
    return;
  }

  if (/\.md($|[?#])/i.test(href)) {
    e.preventDefault();
    const { file, openFile } = useEditorStore.getState();
    if (!file) return;
    const clean = decodeURIComponent(href.split(/[?#]/)[0]).replace(/^\.\//, "");
    const path = /^[a-zA-Z]:[\\/]/.test(clean) ? clean : joinPath(file.dir, clean);
    readMarkdownFile(path)
      .then((f) => openFile(f))
      .catch((err) => console.error("打开链接文件失败:", err));
    return;
  }
}
