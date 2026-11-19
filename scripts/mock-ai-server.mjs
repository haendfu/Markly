// 本地 mock 模型服务：用于离线验证 AI 面板（流式输出 + 修改提案 → diff review）
// 用法：node scripts/mock-ai-server.mjs [端口，默认 8787]
// 然后在 Markly 的 AI 设置里把「接口地址」填成 http://127.0.0.1:8787/v1，模型随便填，Key 随便填。
import http from "node:http";

const port = Number(process.argv[2] ?? 8787);

/** 从上下文里取出当前文档的路径与正文，回一个「改了一小段」的完整文档 */
function buildReply(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((item) => item.role === "user");
  const text = typeof lastUser?.content === "string" ? lastUser.content : "";
  const lines = text.split("\n");

  const headerIndex = lines.findIndex(
    (line) => line.startsWith("<context") && line.includes('kind="document"'),
  );
  if (headerIndex < 0) {
    return "我在上下文里没有看到文档，请先在 Markly 里打开一篇笔记。";
  }

  const header = lines[headerIndex];
  const pathMatch = /path="([^"]+)"/.exec(header);
  const path = pathMatch ? pathMatch[1] : null;
  const endIndex = lines.findIndex((line, index) => index > headerIndex && line.trim() === "</context>");
  const content = lines.slice(headerIndex + 1, endIndex < 0 ? undefined : endIndex).join("\n");

  if (!path) {
    return "上下文里没有带路径的文档，请检查引用设置。";
  }

  const modified = content
    .replace("同目录：", "同目录（mock 模型改过的措辞）：")
    .concat("\n\n> 这一行由 mock 模型追加，用来验证 diff 审阅。\n");

  return [
    "我帮你改了一小段，并补了一句说明。",
    "",
    "```markdown path=\"" + path + "\"",
    modified.trimEnd(),
    "```",
    "",
    "只想保留部分改动的话，在 diff 面板里逐个勾选就行。",
  ].join("\n");
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  const cors = {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "POST, GET, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors).end();
    return;
  }

  if (req.method === "GET" && req.url?.endsWith("/models")) {
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
    return;
  }

  if (req.method !== "POST" || !req.url?.includes("/chat/completions")) {
    res.writeHead(404, { ...cors, "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "mock: 只实现 /v1/chat/completions" } }));
    return;
  }

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      /* 忽略 */
    }
    const reply = buildReply(body);
    console.log(`[mock] 收到请求，回复 ${reply.length} 字符`);

    res.writeHead(200, {
      ...cors,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    const chars = [...reply];
    let index = 0;
    const timer = setInterval(() => {
      if (index >= chars.length) {
        clearInterval(timer);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      const slice = chars.slice(index, index + 12).join("");
      index += 12;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: slice } }] })}\n\n`);
    }, 25);

    // 注意：Node 16+ 里 req 在请求体读完就会 emit "close"（不是「客户端断开」），
    // 用它来清定时器会让流式输出一个字都发不出去。这里用 res 的 close。
    res.on("close", () => clearInterval(timer));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[mock] Markly mock AI 服务已启动: http://127.0.0.1:${port}/v1`);
});
