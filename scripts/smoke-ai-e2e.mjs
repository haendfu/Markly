// 端到端冒烟：真的连本地 mock 模型服务，跑「组上下文 → 流式回收 → 解析提案 → 生成 diff」
// 用法：先 node scripts/mock-ai-server.mjs，再 node scripts/smoke-ai-e2e.mjs
import { buildContext } from "../src/lib/ai/context";
import { buildUserMessage } from "../src/lib/ai/prompt";
import { streamChat } from "../src/lib/ai/client";
import { parseProposals } from "../src/lib/ai/proposal";
import { diffText, applyDiff } from "../src/lib/ai/diff";

const BASE = process.env.MOCK_BASE ?? "http://127.0.0.1:8787/v1";

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const file = {
  path: "W:\\markly\\scripts\\_e2e_sample.md",
  name: "_e2e_sample.md",
  dir: "W:\\markly\\scripts",
  content: "# 图片路径验证\n\n同目录：\n\n![local](local.png)\n",
  eol: "\n",
};

const config = {
  provider: "openai",
  baseUrl: BASE,
  apiKey: "mock-key",
  model: "mock-model",
  temperature: 0.3,
};

const context = await buildContext({
  scope: "doc",
  question: "帮我改一下这篇文档，加一句说明",
  file,
  citations: [],
});

console.log("上下文长度:", context.text.length, "来源:", context.sources.length);
check("上下文包含当前文档", context.text.includes("_e2e_sample.md"));

let reply = "";
let deltas = 0;
await streamChat({
  config,
  system: "你是一个 Markdown 助手。",
  turns: [
    {
      role: "user",
      content: buildUserMessage("帮我改一下这篇文档，加一句说明", context.text),
    },
  ],
  onDelta: (chunk) => {
    deltas += 1;
    reply += chunk;
  },
});

console.log("流式分片:", deltas, "回复长度:", reply.length);
check("收到了流式分片", deltas > 1, `deltas=${deltas}`);
check("回复包含完整内容", reply.includes("mock 模型改过的措辞"), reply.slice(0, 80));

const proposals = parseProposals(reply);
check("解析出一个修改提案", proposals.length === 1, `got ${proposals.length}`);
const proposal = proposals[0];
check("提案路径是绝对路径", proposal?.path?.includes("_e2e_sample.md"), proposal?.path);

const diff = diffText(file.content, proposal.content);
const ops = diff.ops;
const hunkIds = diff.hunks.map((hunk) => hunk.id);
console.log("改动块:", diff.hunks.length, "操作数:", ops.length, `+${diff.adds}/-${diff.dels}`);
check("有可审阅的改动块", diff.hunks.length >= 1, `hunks=${diff.hunks.length}`);

const allAccepted = new Set(hunkIds);
const applied = applyDiff(ops, allAccepted);
check("全部接受后等于模型全文", applied === proposal.content.trimEnd() || applied === proposal.content, `applied=${applied.slice(0, 60)}`);

const noneAccepted = new Set();
const kept = applyDiff(ops, noneAccepted);
check("全部拒绝后保持原文", kept === file.content, JSON.stringify(kept.slice(0, 60)));

console.log(`\n${failed === 0 ? "全部通过" : "有失败项"}：${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
