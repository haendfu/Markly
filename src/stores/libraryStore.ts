import { create } from "zustand";
import { readDir, watchImmediate, mkdir, writeTextFile, rename } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { readMarkdownFile } from "../lib/tauri/files";
import { useEditorStore } from "./editorStore";

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
}

interface LibraryState {
  root: string | null;
  tree: TreeNode[];
  expanded: Set<string>;
  search: string;
  selected: string | null;
  renamingPath: string | null;
  pendingCreate: { dir: string; kind: "note" | "folder" } | null;
  loading: boolean;
  setRenaming: (path: string | null) => void;
  setPendingCreate: (p: { dir: string; kind: "note" | "folder" } | null) => void;
  openLibrary: (dir: string) => void;
  closeLibrary: () => void;
  refresh: () => Promise<void>;
  toggleExpand: (path: string) => void;
  setSearch: (q: string) => void;
  select: (path: string) => void;
  openNote: (path: string) => Promise<void>;
  createNote: (dir: string, name: string) => Promise<void>;
  createFolder: (dir: string, name: string) => Promise<void>;
  renameNode: (path: string, newName: string) => Promise<void>;
  deleteNode: (node: TreeNode) => Promise<void>;
}

let unwatch: (() => void) | null = null;

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return `${dir}${dir.endsWith(sep) ? "" : sep}${name}`;
}

export function parentPath(path: string): string {
  const sep = path.lastIndexOf("\\") > path.lastIndexOf("/") ? "\\" : "/";
  return path.slice(0, path.lastIndexOf(sep));
}

function isMarkdown(name: string) {
  return /\.(md|markdown|mdown|mkd)$/i.test(name);
}

async function buildTree(dir: string, name: string, depth: number): Promise<TreeNode> {
  let entries;
  try {
    entries = await readDir(dir);
  } catch {
    // 无权限/系统目录/连接点等：该目录折叠为不可展开节点，不影响整棵树
    return { name, path: dir, isDir: true, children: [] };
  }
  const children: TreeNode[] = [];
  for (const e of entries) {
    try {
      if (e.name.startsWith(".")) continue;
      const path = joinPath(dir, e.name);
      // 兼容不同版本插件中 isDirectory 为布尔或函数两种形态
      const raw = e.isDirectory as unknown;
      const isDir = typeof raw === "function" ? (raw as () => boolean).call(e) : raw === true;
      if (isDir) {
        if (depth > 0) {
          children.push(await buildTree(path, e.name, depth - 1));
        } else {
          children.push({ name: e.name, path, isDir: true });
        }
      } else if (isMarkdown(e.name)) {
        children.push({ name: e.name, path, isDir: false });
      }
    } catch {
      /* 单个条目异常跳过，不影响其余文件 */
    }
  }
  children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-CN", { numeric: true });
  });
  return { name, path: dir, isDir: true, children };
}

function collectMatches(nodes: TreeNode[], q: string): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) {
      if (n.isDir && n.children) walk(n.children);
      else if (n.name.toLowerCase().includes(q)) out.push(n);
    }
  };
  walk(nodes);
  return out;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  root: null,
  tree: [],
  expanded: new Set(),
  search: "",
  selected: null,
  renamingPath: null,
  pendingCreate: null,
  loading: false,

  setRenaming: (path) => set({ renamingPath: path }),
  setPendingCreate: (p) => set({ pendingCreate: p }),

  openLibrary: (dir) => {
    if (unwatch) {
      unwatch();
      unwatch = null;
    }
    set({ root: dir, loading: true, expanded: new Set([dir]) });
    localStorage.setItem("markly:library", dir);
    get()
      .refresh()
      .then(() => {
        watchImmediate(dir, () => get().refresh()).then((stop) => {
          unwatch = stop;
        }).catch(() => {});
      });
  },

  closeLibrary: () => {
    if (unwatch) {
      unwatch();
      unwatch = null;
    }
    localStorage.removeItem("markly:library");
    set({ root: null, tree: [], search: "", selected: null });
  },

  refresh: async () => {
    const { root } = get();
    if (!root) return;
    try {
      const name = root.split(/[\\/]/).pop() ?? root;
      const tree = [await buildTree(root, name, 4)];
      set({ tree, loading: false });
    } catch (e) {
      console.error("刷新文件库失败:", e);
      set({ loading: false });
    }
  },

  toggleExpand: (path) => {
    const expanded = new Set(get().expanded);
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
    set({ expanded });
  },

  setSearch: (q) => set({ search: q }),
  select: (path) => set({ selected: path }),

  openNote: async (path) => {
    const file = await readMarkdownFile(path);
    useEditorStore.getState().openFile(file);
    set({ selected: path });
  },

  createNote: async (dir, name) => {
    const path = joinPath(dir, name.endsWith(".md") ? name : name + ".md");
    await writeTextFile(path, "");
    await get().refresh();
    await get().openNote(path);
  },

  createFolder: async (dir, name) => {
    await mkdir(joinPath(dir, name), { recursive: false });
    await get().refresh();
  },

  renameNode: async (path, newName) => {
    const dir = parentPath(path);
    const newPath = joinPath(dir, newName);
    await rename(path, newPath);
    const { file } = useEditorStore.getState();
    if (file?.path === path) {
      useEditorStore.setState({ file: { ...file, path: newPath, name: newName } });
    }
    await get().refresh();
  },

  deleteNode: async (node) => {
    const ok = await confirm(`确定将「${node.name}」移入回收站？`, {
      title: "删除",
      kind: "warning",
      okLabel: "删除",
      cancelLabel: "取消",
    });
    if (!ok) return;
    await invoke("trash_item", { path: node.path });
    const { file, closeFile } = useEditorStore.getState();
    if (file?.path === node.path) closeFile();
    await get().refresh();
  },
}));

export { collectMatches };
