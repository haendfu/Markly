import { useCallback, useEffect, useRef } from "react";
import { MilkdownEditor } from "./MilkdownEditor";
import { useEditorStore } from "../../stores/editorStore";
import { saveMarkdownFile } from "../../lib/tauri/save";

/** 所见即所得模式容器：Milkdown 编辑器 + 防抖自动保存 */
export function WysiwygPane() {
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    const t = saveTimer.current;
    return () => {
      if (t) clearTimeout(t);
    };
  }, []);

  const scheduleSave = useCallback((markdown: string) => {
    useEditorStore.getState().setContent(markdown);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const { file, dirty, markSaved } = useEditorStore.getState();
      if (!file || !dirty) return;
      try {
        await saveMarkdownFile(file, file.content);
        markSaved();
      } catch (e) {
        console.error("自动保存失败:", e);
      }
    }, 800);
  }, []);

  const file = useEditorStore((s) => s.file);
  if (!file) return null;

  return (
    <div className="wysiwyg-pane">
      <MilkdownEditor initialMarkdown={file.content} onChange={scheduleSave} />
    </div>
  );
}
