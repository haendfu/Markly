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
  const raw = await invoke<string>("read_text", { path });
  // 去掉 UTF-8 BOM：否则首行会被当成普通段落（`# 标题` 不生效），编辑器里还会出现一个不可见字符
  const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const name = path.split(/[\\/]/).pop() ?? path;
  let dir = path.slice(0, path.length - name.length - 1);
  // 文件直接位于盘符根目录时（C:\note.md）切出来的 dir 是 "C:"，补上分隔符避免拼出 C:imgs\x.png
  if (/^[a-zA-Z]:$/.test(dir)) dir += path.includes("/") && !path.includes("\\") ? "/" : "\\";
  // 换行风格在读取时确定：编辑器的缓冲区可能已被规整为 LF
  const eol: "\r\n" | "\n" = content.includes("\r\n") ? "\r\n" : "\n";
  return { path, name, dir, content, eol };
}
