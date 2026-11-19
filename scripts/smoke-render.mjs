// 渲染管线冒烟测试：node 环境 + 最小 document stub
// 用 vite-node 跑 TS 模块: node node_modules/vite-node/dist/cli.mjs scripts/smoke-render.mjs
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html data-theme='light'></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

const { renderMarkdown } = await import("../src/lib/markdown/renderer.ts");
const { resolveLocalPath, normalizeFsPath, imageSourceOf, displayImageSource } = await import(
  "../src/lib/markdown/assets.ts"
);

let failed = 0;
function check(name, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.error(`FAIL ${name}\n  期望: ${expected}\n  实际: ${actual}`);
  }
}

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

for (const [name, src] of Object.entries(cases)) {
  try {
    const html = renderMarkdown(src);
    console.log(`PASS ${name}: ${html.replace(/\n/g, "").slice(0, 90)}...`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}:`, e.message);
  }
}

/* ---------- 图片地址解析（本次修复的重点） ---------- */

const DOC_DIR = "W:\\notes\\sub";

function imgOf(markdown, baseDir = DOC_DIR) {
  const dom2 = new JSDOM(`<!DOCTYPE html><body>${renderMarkdown(markdown, { baseDir })}</body>`);
  return dom2.window.document.querySelector("img");
}

// 1. 相对路径：以文档目录为根，而不是应用/工作区根
let img = imgOf("![a](imgs/a.png)");
check("相对路径 src", img.getAttribute("src"), "file:///W:/notes/sub/imgs/a.png");
check("相对路径 data-src", img.getAttribute("data-src"), "imgs/a.png");

// 2. ./ 前缀
img = imgOf("![a](./imgs/a.png)");
check("./ 前缀 src", img.getAttribute("src"), "file:///W:/notes/sub/imgs/a.png");

// 3. ../ 上跳
img = imgOf("![a](../shared/a.png)");
check("../ 上跳 src", img.getAttribute("src"), "file:///W:/notes/shared/a.png");

// 4. Windows 绝对路径（markdown-it 会把反斜杠转义成 %5C）
img = imgOf("![a](C:\\notes\\imgs\\a.png)");
check("盘符绝对路径 src", img.getAttribute("src"), "file:///C:/notes/imgs/a.png");

// 5. 以 / 开头：视为文档所在盘符的根
img = imgOf("![a](/imgs/a.png)");
check("根路径 src", img.getAttribute("src"), "file:///W:/imgs/a.png");

// 6. file:// URL（markdown-it 的 validateLink 会拒绝 file:，用内嵌 HTML 验证）
img = imgOf('<img src="file:///C:/pics/a.png">');
check("file:// URL src", img.getAttribute("src"), "file:///C:/pics/a.png");

// 7. 远程图片与 data URI 保持不变，且不写 data-src
img = imgOf("![a](https://example.com/a.png)");
check("远程图 src", img.getAttribute("src"), "https://example.com/a.png");
check("远程图 data-src", img.getAttribute("data-src"), null);

img = imgOf("![a](data:image/png;base64,iVBORw0KGgo=)");
check("data URI src", img.getAttribute("src"), "data:image/png;base64,iVBORw0KGgo=");

// 8. 中文与空格路径需要正确解码后再编码
img = imgOf("![a](<imgs/中文 图.png>)");
check("中文路径 src", img.getAttribute("src"), "file:///W:/notes/sub/imgs/%E4%B8%AD%E6%96%87%20%E5%9B%BE.png");

// 9. 内嵌 HTML 的 img 同样改写
img = imgOf('<img src="imgs/b.png" alt="b">');
check("内嵌 HTML src", img.getAttribute("src"), "file:///W:/notes/sub/imgs/b.png");

// 10. Tauri 环境：走 asset 协议
globalThis.window.__TAURI_INTERNALS__ = {
  convertFileSrc: (p) => `asset://localhost/${encodeURIComponent(p)}`,
};
img = imgOf("![a](imgs/a.png)");
check(
  "Tauri asset 协议 src",
  img.getAttribute("src"),
  "asset://localhost/" + encodeURIComponent("W:\\notes\\sub\\imgs\\a.png"),
);
check("Tauri asset data-src", img.getAttribute("data-src"), "imgs/a.png");
delete globalThis.window.__TAURI_INTERNALS__;

/* ---------- 导出内联：必须能从 data-src 还原绝对路径 ---------- */

const exportImg = imgOf("![a](imgs/a.png)");
check("导出取原始地址", imageSourceOf(exportImg), "imgs/a.png");
check(
  "导出还原绝对路径",
  resolveLocalPath(imageSourceOf(exportImg), DOC_DIR),
  "W:\\notes\\sub\\imgs\\a.png",
);

// 绝对路径图片同样要先写 data-src，否则导出时拿到的是 asset/file URL
const absImg = imgOf("![a](C:\\notes\\imgs\\a.png)");
check("导出取原始地址(绝对)", imageSourceOf(absImg), "C:%5Cnotes%5Cimgs%5Ca.png");
check(
  "导出还原绝对路径(绝对)",
  resolveLocalPath(imageSourceOf(absImg), DOC_DIR),
  "C:\\notes\\imgs\\a.png",
);
check("复制地址可读化", displayImageSource(absImg), "C:\\notes\\imgs\\a.png");
check(
  "复制地址不解码远程",
  displayImageSource(imgOf("![a](https://example.com/a%20b.png)")),
  "https://example.com/a%20b.png",
);

/* ---------- 路径归一化 ---------- */

check("归一化 ..", normalizeFsPath("W:\\notes\\sub\\..\\..\\x.png"), "W:\\x.png");
check("归一化 ./", normalizeFsPath("W:\\notes\\.\\a.png"), "W:\\notes\\a.png");
check("归一化 UNC", normalizeFsPath("\\\\server\\share\\a\\..\\b.png"), "\\\\server\\share\\b.png");
check("resolveLocalPath 远程", resolveLocalPath("https://x/y.png", DOC_DIR), null);
check("resolveLocalPath 空 baseDir", resolveLocalPath("a.png", null), "a.png");
check("resolveLocalPath 查询串", resolveLocalPath("imgs/a.png?v=2", DOC_DIR), "W:\\notes\\sub\\imgs\\a.png");

console.log(failed ? `\n${failed} 项失败` : `\n全部通过`);
process.exit(failed ? 1 : 0);
