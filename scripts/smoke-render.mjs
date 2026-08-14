// 渲染管线冒烟测试：node 环境 + 最小 document stub
// 用 vite-node 跑 TS 模块: npx vite-node scripts/smoke-render.mjs
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html data-theme='light'></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

const { renderMarkdown } = await import("../src/lib/markdown/renderer.ts");

const cases = {
  heading: "# 标题一\n\n## 二级 **粗体**\n\n### 三级\n\n## 二级",
  katex: "行内 $E=mc^2$ 公式\n\n$$\\int_0^1 x\\,dx = \\frac12$$",
  table: "| a | b |\n|--|--|\n| 1 | 2 |",
  task: "- [x] 完成\n- [ ] 待办",
  footnote: "引用[^1]\n\n[^1]: 底注",
  code: "```typescript\nconst x: number = 1;\n```",
  mermaid: "```mermaid\nflowchart LR\n  A-->B\n```",
  blockquote: "> 引用文本",
  list: "1. 一\n2. 二\n\n- 甲\n  - 乙",
};

let failed = 0;
for (const [name, src] of Object.entries(cases)) {
  try {
    const html = renderMarkdown(src);
    console.log(`PASS ${name}: ${html.replace(/\n/g, "").slice(0, 90)}...`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}:`, e.message);
  }
}
process.exit(failed ? 1 : 0);
