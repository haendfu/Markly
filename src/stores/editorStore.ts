import { create } from "zustand";

export type EditorMode = "read" | "wysiwyg" | "source";

export interface OpenFile {
  path: string;
  name: string;
  dir: string;
  content: string;
  /** 磁盘文件的换行风格，保存时保持原样 */
  eol?: "\r\n" | "\n";
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

/** path 是否就是 dir 或位于 dir 之内 */
export function isPathInside(path: string, dir: string): boolean {
  if (path === dir) return true;
  return path.startsWith(`${dir}\\`) || path.startsWith(`${dir}/`);
}

/**
 * 重命名 / 移动文件或目录后，同步当前文件与历史里的路径。
 * 否则自动保存会继续写回旧路径（把已改名的文件重新创建出来）。
 */
export function remapEditorPaths(from: string, to: string) {
  const state = useEditorStore.getState();
  const patch: Partial<EditorState> = {};

  if (state.file && isPathInside(state.file.path, from)) {
    const path = to + state.file.path.slice(from.length);
    const name = path.split(/[\\/]/).pop() ?? path;
    patch.file = { ...state.file, path, name, dir: path.slice(0, path.length - name.length - 1) };
  }

  const history = state.history.map((h) =>
    isPathInside(h.path, from) ? { ...h, path: to + h.path.slice(from.length) } : h,
  );
  if (history.some((h, i) => h !== state.history[i])) patch.history = history;

  if (Object.keys(patch).length > 0) useEditorStore.setState(patch);
}
