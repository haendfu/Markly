import { useCallback, useEffect, useRef, useState } from "react";
import { SourceEditor } from "./SourceEditor";
import { SplitPreview } from "./SplitPreview";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { saveMarkdownFile } from "../../lib/tauri/save";

/** 源码模式容器：编辑器 + 可选分屏预览 + 防抖自动保存 */
export function SourcePane() {
  const splitPreview = useSettingsStore((s) => s.splitPreview);
  const [scrollRatio, setScrollRatio] = useState(0);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    const t = saveTimer.current;
    return () => {
      if (t) clearTimeout(t);
    };
  }, []);

  const scheduleSave = useCallback(() => {
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

  return (
    <div className="source-pane">
      <SourceEditor
        onScrollRatio={setScrollRatio}
        onChange={(doc) => {
          useEditorStore.getState().setContent(doc);
          scheduleSave();
        }}
      />
      {splitPreview && (
        <div className="source-pane-preview">
          <SplitPreview editorScrollRatio={scrollRatio} />
        </div>
      )}
    </div>
  );
}
