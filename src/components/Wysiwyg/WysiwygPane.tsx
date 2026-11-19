import { useCallback, useEffect } from "react";
import { MilkdownEditor } from "./MilkdownEditor";
import { useEditorStore } from "../../stores/editorStore";
import { flushAutosave, scheduleAutosave } from "../../lib/autosave";

/** 所见即所得模式容器：Milkdown 编辑器 + 防抖自动保存 */
export function WysiwygPane() {
  const file = useEditorStore((s) => s.file);
  const docVersion = useEditorStore((s) => s.docVersion);
  const path = file?.path ?? null;

  const handleChange = useCallback((markdown: string) => {
    const store = useEditorStore.getState();
    store.setContent(markdown);
    scheduleAutosave(store.file, markdown);
  }, []);

  // 切换文件或离开编辑模式：把待保存的编辑落回原文件
  useEffect(() => () => void flushAutosave(), [path]);

  if (!file) return null;

  return (
    <div className="wysiwyg-pane">
      {/* key 绑定文件与文档版本：否则切换笔记 / AI 整篇改写后 Milkdown 仍持有旧文档 */}
      <MilkdownEditor
        key={`${path ?? "none"}:${docVersion}`}
        initialMarkdown={file.content}
        baseDir={file.dir}
        onChange={handleChange}
      />
    </div>
  );
}
