import { useMemo } from "react";

export interface OutlineHeading {
  level: number;
  text: string;
}

/** 从 markdown 源码提取标题（跳过代码块内的 # 行） */
export function extractHeadings(markdown: string): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  let inCode = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      out.push({
        level: m[1].length,
        text: m[2].replace(/[*_`~\[\]]/g, "").trim(),
      });
    }
  }
  return out;
}

export function useOutline(markdown: string): OutlineHeading[] {
  return useMemo(() => extractHeadings(markdown), [markdown]);
}
