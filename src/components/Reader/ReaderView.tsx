import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { renderMarkdown } from "../../lib/markdown/renderer";
import { ensureHighlighter } from "../../lib/markdown/shiki";
import { renderMermaidBlocks } from "../../lib/markdown/mermaid";
import { handleContentClick } from "../../lib/contentLinks";

export function ReaderView() {
  const file = useEditorStore((s) => s.file);
  const theme = useSettingsStore((s) => s.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPathRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  // 高亮器就绪后触发一次重渲染
  useEffect(() => {
    ensureHighlighter().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!file || !containerRef.current) return;
    const el = containerRef.current;
    el.innerHTML = renderMarkdown(file.content, { baseDir: file.dir });
    renderMermaidBlocks(el);
    // 只有换文件才回到顶部：切主题、内容变更都不该丢掉阅读位置
    if (lastPathRef.current !== file.path) {
      lastPathRef.current = file.path;
      el.closest(".content-area")?.scrollTo({ top: 0 });
    }
    const onClick = (e: MouseEvent) => handleContentClick(e, el);
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [file, theme, ready]);

  if (!file) return null;

  return <div ref={containerRef} className="markdown-body reader-view" />;
}
