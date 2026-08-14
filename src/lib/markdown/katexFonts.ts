// 导出用：KaTeX 核心字体内联（构建时 base64，动态导入避免进入主包）
export async function katexFontCss(): Promise<string> {
  const { fonts } = await import("./katexFontData");
  return Object.entries(fonts)
    .map(
      ([name, url]) =>
        `@font-face{font-family:"${name.split("-")[0]}";src:url(${url}) format("woff2");font-weight:${
          name.includes("Bold") ? "bold" : "normal"
        };font-style:${name.includes("Italic") ? "italic" : "normal"};}`,
    )
    .join("\n");
}
