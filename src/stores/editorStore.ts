import { create } from "zustand";

export type EditorMode = "read" | "wysiwyg" | "source";

export interface OpenFile {
  path: string;
  name: string;
  dir: string;
  content: string;
}

interface HistoryEntry {
  path: string;
  mode: EditorMode;
}

interface EditorState {
  mode: EditorMode;
  file: OpenFile | null;
  dirty: boolean;
  history: HistoryEntry[];
  historyIdx: number;
  setMode: (m: EditorMode) => void;
  openFile: (f: OpenFile, opts?: { pushHistory?: boolean; mode?: EditorMode }) => void;
  closeFile: () => void;
  setContent: (c: string) => void;
  markSaved: () => void;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
}

async function loadEntry(entry: HistoryEntry): Promise<void> {
  const { readMarkdownFile } = await import("../lib/tauri/files");
  try {
    const file = await readMarkdownFile(entry.path);
    useEditorStore.setState({ file, mode: entry.mode, dirty: false });
  } catch {
    /* 文件可能已移动/删除 */
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  mode: "read",
  file: null,
  dirty: false,
  history: [],
  historyIdx: -1,

  setMode: (m) => set({ mode: m }),

  openFile: (f, opts) => {
    const pushHistory = opts?.pushHistory ?? true;
    const { history, historyIdx } = get();
    const mode = opts?.mode ?? "read";
    if (pushHistory) {
      const truncated = history.slice(0, historyIdx + 1);
      if (truncated[truncated.length - 1]?.path !== f.path) {
        truncated.push({ path: f.path, mode });
        set({
          file: f,
          mode,
          dirty: false,
          history: truncated.slice(-50),
          historyIdx: Math.min(truncated.length - 1, 49),
        });
      } else {
        set({ file: f, mode, dirty: false, historyIdx: truncated.length - 1, history: truncated });
      }
    } else {
      set({ file: f, mode, dirty: false });
    }
  },

  closeFile: () => set({ file: null, mode: "read", dirty: false }),

  setContent: (c) =>
    set((s) => (s.file ? { file: { ...s.file, content: c }, dirty: true } : {})),

  markSaved: () => set({ dirty: false }),

  goBack: async () => {
    const { history, historyIdx } = get();
    if (historyIdx <= 0) return;
    const entry = history[historyIdx - 1];
    set({ historyIdx: historyIdx - 1 });
    await loadEntry(entry);
  },

  goForward: async () => {
    const { history, historyIdx, file } = get();
    if (historyIdx >= history.length - 1) return;
    // 先记录当前文件的当前模式
    if (file) history[historyIdx] = { path: file.path, mode: get().mode };
    const entry = history[historyIdx + 1];
    set({ historyIdx: historyIdx + 1 });
    await loadEntry(entry);
  },
}));

/** 把当前文件与模式记入历史条目（模式切换时调用） */
export function syncHistoryMode() {
  const { file, mode, history, historyIdx } = useEditorStore.getState();
  if (file && history[historyIdx]) history[historyIdx] = { path: file.path, mode };
}
