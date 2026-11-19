import { useCallback, useEffect, useState } from "react";
import { SourceEditor } from "./SourceEditor";
import { SplitPreview } from "./SplitPreview";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { flushAutosave, scheduleAutosave } from "../../lib/autosave";

/** 源码模式容器：编辑器 + 可选分屏预览 + 防抖自动保存 */
export function SourcePane() {
  const splitPreview = useSettingsStore((s) => s.splitPreview);
  const path = useEditorStore((s) => s.file?.path ?? null);
  const [scrollRatio, setScrollRatio] = useState(0);

  const handleChange = useCallback((doc: string) => {
    const store = useEditorStore.getState();
    store.setContent(doc);
    scheduleAutosave(store.file, doc);
  }, []);

  // 切换文件或离开编辑模式：把待保存的编辑落回原文件
  useEffect(() => () => void flushAutosave(), [path]);

  return (
    <div className="source-pane">
      {/* key 必须绑定文件：否则切换笔记时 CodeMirror 仍持有上一份文档 */}
      <SourceEditor key={path ?? "none"} onScrollRatio={setScrollRatio} onChange={handleChange} />
      {splitPreview && (
        <div className="source-pane-preview">
          <SplitPreview editorScrollRatio={scrollRatio} />
        </div>
      )}
    </div>
  );
}
