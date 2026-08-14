import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { OpenFile } from "../../stores/editorStore";

export const MARKDOWN_EXT = /\.(md|markdown|mdown|mkd)$/i;

export async function pickAndOpenMarkdownFile(): Promise<OpenFile | null> {
  const path = await open({
    title: "打开 Markdown 文件",
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }],
    multiple: false,
    directory: false,
  });
  if (!path || typeof path !== "string") return null;
  return readMarkdownFile(path);
}

/** 经 Rust 命令读取（不受 fs 插件作用域/路径格式影响） */
export async function readMarkdownFile(path: string): Promise<OpenFile> {
  const content = await invoke<string>("read_text", { path });
  const name = path.split(/[\\/]/).pop() ?? path;
  const dir = path.slice(0, path.length - name.length - 1);
  return { path, name, dir, content };
}
