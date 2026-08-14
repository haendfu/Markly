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
  const fontSize = useSettingsStore((s) => s.fontSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // 高亮器就绪后触发一次重渲染
  useEffect(() => {
    ensureHighlighter().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!file || !containerRef.current) return;
    const el = containerRef.current;
    el.innerHTML = renderMarkdown(file.content);
    renderMermaidBlocks(el);
    el.closest(".content-area")?.scrollTo({ top: 0 });
    const onClick = (e: MouseEvent) => handleContentClick(e, el);
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [file, theme, ready]);

  if (!file) return null;

  return (
    <div
      ref={containerRef}
      className="markdown-body reader-view"
      style={{ "--content-font-size": `${fontSize}px` } as React.CSSProperties}
    />
  );
}
