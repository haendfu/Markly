import type { Mermaid } from "mermaid";

let mermaid: Mermaid | null = null;
let loading: Promise<Mermaid> | null = null;

async function ensureMermaid(): Promise<Mermaid> {
  if (mermaid) return mermaid;
  if (!loading) {
    loading = import("mermaid").then((m) => {
      mermaid = m.default;
      return mermaid;
    });
  }
  return loading;
}

function mermaidTheme(dark: boolean) {
  return dark ? "dark" : "default";
}

let renderSeq = 0;

/** 渲染容器内所有 .mermaid-block：源码 → SVG */
export async function renderMermaidBlocks(container: HTMLElement) {
  const blocks = container.querySelectorAll<HTMLElement>(".mermaid-block:not([data-mermaid-done])");
  if (blocks.length === 0) return;

  const m = await ensureMermaid();
  const dark = ["dark", "midnight"].includes(
    document.documentElement.getAttribute("data-theme") ?? "",
  );
  m.initialize({
    startOnLoad: false,
    theme: mermaidTheme(dark),
    securityLevel: "strict",
    fontFamily: getComputedStyle(document.body).fontFamily,
  });

  for (const block of blocks) {
    const source = block.querySelector<HTMLElement>(".mermaid-source")?.textContent ?? "";
    if (!source.trim()) continue;
    const id = `mermaid-svg-${++renderSeq}`;
    try {
      const { svg } = await m.render(id, source);
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-rendered";
      wrapper.innerHTML = svg;
      block.replaceChildren(wrapper);
    } catch (e) {
      block.innerHTML = `<div class="mermaid-error">图表渲染失败：${String(e)}</div>`;
    }
    block.setAttribute("data-mermaid-done", "1");
  }
}

export function invalidateMermaidBlocks(container: HTMLElement) {
  container
    .querySelectorAll(".mermaid-block[data-mermaid-done]")
    .forEach((el) => el.removeAttribute("data-mermaid-done"));
}
