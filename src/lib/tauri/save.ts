import { invoke } from "@tauri-apps/api/core";
import type { OpenFile } from "../../stores/editorStore";

/** 保留文件原有换行风格（CRLF/LF）后保存，经 Rust 命令写入 */
export async function saveMarkdownFile(file: OpenFile, content: string) {
  // 以「打开时的磁盘内容」为准判断换行风格：编辑后的缓冲区可能已被规整为 LF
  const eol = file.eol ?? (file.content.includes("\r\n") ? "\r\n" : "\n");
  const normalized =
    eol === "\r\n" ? content.replace(/\r?\n/g, "\r\n") : content.replace(/\r\n/g, "\n");
  await invoke("write_text", { path: file.path, content: normalized });
}
