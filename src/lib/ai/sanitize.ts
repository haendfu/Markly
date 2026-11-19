import { renderMarkdown } from "../markdown/renderer";

/**
 * 渲染 AI 回答：模型输出同样是 Markdown，但不能信任里面的 HTML。
 * markdown-it 开了 html:true，所以这里过一遍白名单式清洗：
 * 去掉脚本类标签、事件属性、javascript: 链接，外链一律新窗口打开。
 */
const DROP_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "form",
  "input",
  "textarea",
  "select",
  "option",
  "button",
].join(",");

export function renderChatHtml(markdown: string, baseDir?: string | null): string {
  const html = renderMarkdown(markdown, { baseDir });
  if (typeof document === "undefined") return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  template.content.querySelectorAll(DROP_TAGS).forEach((el) => el.remove());
  template.content.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if (
        (attr.name === "href" || attr.name === "src" || attr.name === "xlink:href") &&
        /^\s*(javascript|data:text\/html|vbscript):/i.test(attr.value)
      ) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noreferrer noopener");
    }
  });

  return template.innerHTML;
}
