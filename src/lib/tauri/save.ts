import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { OpenFile } from "../../stores/editorStore";

/** 保留文件原有换行风格（CRLF/LF）后保存 */
export async function saveMarkdownFile(file: OpenFile, content: string) {
  const crlf = file.content.includes("\r\n") || detectOriginalEol(file);
  const normalized = crlf ? content.replace(/\r?\n/g, "\r\n") : content;
  await writeTextFile(file.path, normalized);
}

function detectOriginalEol(file: OpenFile): boolean {
  // 打开时记录的 content 即原始内容；后续 setContent 后靠 dirty 内容判断
  return file.content.includes("\r\n");
}
