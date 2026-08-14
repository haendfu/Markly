import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "../../lib/markdown/renderer";
import { renderMermaidBlocks } from "../../lib/markdown/mermaid";
import { handleContentClick } from "../../lib/contentLinks";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";

/** 源码模式的实时预览面板，含滚动同步（渲染防抖 250ms） */
export function SplitPreview({
  editorScrollRatio,
}: {
  editorScrollRatio?: number;
}) {
  const rawContent = useEditorStore((s) => s.file?.content ?? "");
  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [content, setContent] = useState(rawContent);

  useEffect(() => {
    const t = window.setTimeout(() => setContent(rawContent), 250);
    return () => clearTimeout(t);
  }, [rawContent]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = renderMarkdown(content);
    renderMermaidBlocks(el);
    const onClick = (e: MouseEvent) => handleContentClick(e, el);
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [content, theme]);

  // 比例滚动同步（编辑区 → 预览区）
  useEffect(() => {
    const el = containerRef.current;
    if (!el || editorScrollRatio === undefined || syncing.current) return;
    el.scrollTop = editorScrollRatio * (el.scrollHeight - el.clientHeight);
  }, [editorScrollRatio]);

  return (
    <div
      ref={containerRef}
      className="markdown-body split-preview"
      style={{ "--content-font-size": `${fontSize}px` } as React.CSSProperties}
    />
  );
}
