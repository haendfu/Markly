import type { OpenFile } from "../stores/editorStore";
import { isPathInside, useEditorStore } from "../stores/editorStore";
import { saveMarkdownFile } from "./tauri/save";

/**
 * 编辑区自动保存（800ms 防抖）。
 *
 * 关键点：待保存的内容与目标文件在「调度时」就固定下来，
 * 这样切换文件/退出编辑模式时不会把旧文档写进新文件，也不会丢掉最后一段编辑。
 */

interface PendingSave {
  file: OpenFile;
  content: string;
}

const DELAY = 800;

let timer: number | null = null;
let pending: PendingSave | null = null;

function clearTimer() {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

export function scheduleAutosave(file: OpenFile | null, content: string) {
  if (!file) return;
  pending = { file, content };
  clearTimer();
  timer = window.setTimeout(() => {
    timer = null;
    void flushAutosave();
  }, DELAY);
}

/** 立即落盘（切换文件、切换模式、卸载编辑器时调用） */
export async function flushAutosave(): Promise<void> {
  clearTimer();
  const job = pending;
  pending = null;
  if (!job) return;
  try {
    await saveMarkdownFile(job.file, job.content);
    const { file, markSaved } = useEditorStore.getState();
    // 只清理「仍在看同一文件且内容未被继续修改」的脏标记
    if (file?.path === job.file.path && file.content === job.content) markSaved();
  } catch (e) {
    console.error("自动保存失败:", e);
  }
}

/** 是否有待落盘的编辑（卸载提示/调试用） */
export function hasPendingAutosave(): boolean {
  return pending !== null;
}

/**
 * 丢弃待保存内容（文件被删除/移入回收站时调用）。
 * 不丢弃的话，定时器到点会把已删除的文件重新写出来。
 */
export function cancelAutosave(pathPrefix?: string): void {
  if (!pending) return;
  if (pathPrefix && !isPathInside(pending.file.path, pathPrefix)) return;
  clearTimer();
  pending = null;
}
