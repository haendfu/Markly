import { invoke } from "@tauri-apps/api/core";
import type { OpenFile } from "../../stores/editorStore";

/** 保留文件原有换行风格（CRLF/LF）后保存，经 Rust 命令写入 */
export async function saveMarkdownFile(file: OpenFile, content: string) {
  const crlf = file.content.includes("\r\n");
  const normalized = crlf ? content.replace(/\r?\n/g, "\r\n") : content;
  await invoke("write_text", { path: file.path, content: normalized });
}
