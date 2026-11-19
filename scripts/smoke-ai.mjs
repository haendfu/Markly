// AI 助手核心逻辑冒烟测试（不联网）：
// diff / 提案解析 / SSE 解析 / 请求构造 / 上下文拼装 / 回答清洗
// 用 vite-node 跑: node node_modules/vite-node/dist/cli.mjs scripts/smoke-ai.mjs
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html data-theme='light'></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

const { diffText, applyDiff } = await import("../src/lib/ai/diff.ts");
const { parseProposals } = await import("../src/lib/ai/proposal.ts");
const { createSseParser, buildChatRequest } = await import("../src/lib/ai/providers.ts");
const { buildSystemPrompt, buildUserMessage } = await import("../src/lib/ai/prompt.ts");
const { buildContext, questionTokens } = await import("../src/lib/ai/context.ts");
const { renderChatHtml } = await import("../src/lib/ai/sanitize.ts");

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.error(`FAIL ${name}\n  期望: ${JSON.stringify(expected)}\n  实际: ${JSON.stringify(actual)}`);
  }
}
function ok(name, condition, detail = "") {
  if (condition) console.log(`PASS ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name} ${detail}`);
  }
}

/* ---------- 行级 diff ---------- */

{
  const before = "a\nb\nc";
  const after = "a\nB\nc";
  const diff = diffText(before, after);
  check("diff 单处改动 hunk 数", diff.hunks.length, 1);
  check("diff +行数", diff.adds, 1);
  check("diff -行数", diff.dels, 1);
  check("diff 全接受 = 新文本", applyDiff(diff.ops, new Set(diff.hunks.map((h) => h.id))), after);
  check("diff 全拒绝 = 原文本", applyDiff(diff.ops, new Set()), before);
}

{
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
  const after = before.replace("line 2", "LINE TWO").replace("line 18", "LINE EIGHTEEN");
  const diff = diffText(before, after);
  check("diff 两处远隔改动 = 2 hunk", diff.hunks.length, 2);
  const onlyFirst = new Set([0]);
  const applied = applyDiff(diff.ops, onlyFirst);
  ok("只接受第一处 → 第二处保持原文", applied.includes("line 18") && !applied.includes("LINE EIGHTEEN"));
  ok("只接受第一处 → 第一处已改", applied.includes("LINE TWO"));
}

{
  check("相同文本没有 hunk", diffText("x\ny", "x\ny").hunks.length, 0);
  const big = Array.from({ length: 3000 }, (_, i) => `n${i}`).join("\n");
  const bigAfter = Array.from({ length: 3000 }, (_, i) => `m${i}`).join("\n");
  check("超长文本退化为整篇替换", diffText(big, bigAfter).hunks.length, 1);
}

/* ---------- 提案解析 ---------- */

{
  const reply = [
    "好的，我把它改成：",
    "",
    '```markdown path="W:\\notes\\a.md"',
    "# 新标题",
    "",
    "正文",
    "```",
    "",
    "另外这段是普通示例：",
    "",
    "```js",
    "console.log(1)",
    "```",
  ].join("\n");
  const proposals = parseProposals(reply);
  check("提案个数（普通代码块不算）", proposals.length, 1);
  check("提案路径", proposals[0].path, "W:\\notes\\a.md");
  check("提案内容", proposals[0].content, "# 新标题\n\n正文\n");
}

/* ---------- SSE 解析 ---------- */

{
  const parser = createSseParser("openai");
  // 故意在网络分片处劈开一行
  const first = 'data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"del';
  const second = 'ta":{"content":"好"}}]}\n\ndata: [DONE]\n\n';
  const out = parser.push(first) + parser.push(second);
  check("SSE 合并增量", out, "你好");
  check("SSE 收到 DONE", parser.finished, true);
}

{
  const parser = createSseParser("anthropic");
  const chunk =
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"世界"}}\n\n';
  check("Anthropic 文本增量", parser.push(chunk), "世界");
}

/* ---------- 请求构造 ---------- */

{
  const config = {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1/",
    apiKey: "sk-test",
    model: "gpt-4o-mini",
    temperature: 0.3,
  };
  const request = buildChatRequest(config, "SYS", [{ role: "user", content: "hi" }]);
  check("openai url", request.url, "https://api.openai.com/v1/chat/completions");
  check("openai 鉴权头", request.headers.authorization, "Bearer sk-test");
  const body = JSON.parse(request.body);
  check("openai 系统消息在最前", body.messages[0], { role: "system", content: "SYS" });
  check("openai 流式", body.stream, true);

  const claude = buildChatRequest({ ...config, provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" }, "SYS", [
    { role: "user", content: "hi" },
  ]);
  check("anthropic url", claude.url, "https://api.anthropic.com/v1/messages");
  check("anthropic key 头", claude.headers["x-api-key"], "sk-test");
  check("anthropic 版本头", claude.headers["anthropic-version"], "2023-06-01");
}

/* ---------- 提示词与上下文 ---------- */

{
  const system = buildSystemPrompt();
  ok("系统提示要求带路径的围栏块", system.includes('path="'));
  ok("系统提示要求用 [1] 标引用", system.includes("[1]"));

  const user = buildUserMessage("问题", "<context>x</context>");
  ok("用户消息包裹 context", user.includes("<context>x</context>") && user.includes("问题"));
}

{
  const file = {
    path: "W:\\notes\\sub\\note.md",
    name: "note.md",
    dir: "W:\\notes\\sub",
    content: "# 记得\n\n这里有一句话。",
  };
  const built = await buildContext({ scope: "doc", question: "这句话是什么", file, citations: [] });
  ok("doc 模式带上当前文档", built.text.includes("# 记得"));
  check("doc 模式来源数", built.sources.length, 1);
  ok("context 带 index/path 属性", built.text.includes('index="1"') && built.text.includes("note.md"));

  const citation = { id: "c1", path: "W:\\notes\\other.md", label: "other.md", text: "别处的段落", kind: "selection" };
  const withCite = await buildContext({ scope: "doc", question: "q", file, citations: [citation] });
  check("引用在前 + 文档在后", withCite.sources.length, 2);
  ok("引用 kind=selection", withCite.text.includes('kind="selection"'));

  const tokens = questionTokens("How to 修复 图片路径 bug");
  ok("分词包含英文词", tokens.includes("how") || tokens.includes("bug"));
  ok("中文切成 2 字", tokens.includes("图片") || tokens.includes("路径"));
}

/* ---------- 回答清洗 ---------- */

{
  const html = renderChatHtml('<p>正常</p><script>alert(1)</script><img src=x onerror="alert(1)">');
  ok("清洗掉 script", !html.includes("<script"));
  ok("清洗掉 onerror", !/onerror/i.test(html));
}

console.log(failed === 0 ? "\n全部通过" : `\n失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
