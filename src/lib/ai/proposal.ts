/**
 * 从模型回复里提取「整篇文件替换」提案。
 *
 * 约定：只认带路径的围栏代码块，例如
 *
 *   ```markdown path="notes/a.md"
 *   ...完整内容...
 *   ```
 *
 * 这样普通代码示例不会被误当成文档修改；而且整篇替换对模型来说
 * 比统一 diff 更不容易算错行号（行号错了 review 时会显示成一片乱改）。
 */

export interface FileProposal {
  path: string | null;
  content: string;
}

const FENCE_RE = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
const PATH_RE = /(?:path|file)\s*=\s*["']?([^"'\s]+)["']?/i;

export function parseProposals(text: string): FileProposal[] {
  const out: FileProposal[] = [];
  for (const match of text.matchAll(FENCE_RE)) {
    const info = match[1] ?? "";
    const pathMatch = PATH_RE.exec(info);
    if (!pathMatch) continue;
    const body = match[2] ?? "";
    out.push({ path: pathMatch[1], content: body.replace(/\r\n/g, "\n") });
  }
  return out;
}
