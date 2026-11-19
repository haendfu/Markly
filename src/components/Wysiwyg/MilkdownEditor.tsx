import { useEffect } from "react";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
import { commonmark, imageSchema } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { prism } from "@milkdown/plugin-prism";
import { math } from "@milkdown/plugin-math";
import { $view } from "@milkdown/kit/utils";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { NodeView } from "@milkdown/kit/prose/view";
import { registerMilkdown } from "../../lib/blockInsert";
import { resolveImageSrc } from "../../lib/markdown/assets";

interface Props {
  initialMarkdown: string;
  /** 文档所在目录：本地图片以它为根解析 */
  baseDir: string | null;
  onChange: (markdown: string) => void;
}

/**
 * 图片节点视图：把文档里的本地地址换成 WebView 可加载的 asset URL。
 * ProseMirror 的节点属性仍保存原始地址，保证 markdown 序列化不被污染。
 */
function createImageNodeView(baseDir: string | null) {
  return (node: ProseMirrorNode): NodeView => {
    const dom = document.createElement("img");
    dom.className = "md-image";
    dom.draggable = true;

    const render = (n: ProseMirrorNode) => {
      const raw = String(n.attrs.src ?? "");
      const resolved = resolveImageSrc(raw, baseDir);
      if (resolved) {
        dom.setAttribute("src", resolved);
        dom.setAttribute("data-src", raw);
      } else {
        dom.setAttribute("src", raw);
        dom.removeAttribute("data-src");
      }
      const alt = String(n.attrs.alt ?? "");
      if (alt) dom.setAttribute("alt", alt);
      else dom.removeAttribute("alt");
      const title = String(n.attrs.title ?? "");
      if (title) dom.setAttribute("title", title);
      else dom.removeAttribute("title");
    };

    render(node);

    return {
      dom,
      update: (next) => {
        if (next.type.name !== "image") return false;
        render(next);
        return true;
      },
      selectNode: () => dom.classList.add("ProseMirror-selectednode"),
      deselectNode: () => dom.classList.remove("ProseMirror-selectednode"),
      ignoreMutation: () => true,
    };
  };
}

function MilkdownEditorInner({ initialMarkdown, baseDir, onChange }: Props) {
  useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initialMarkdown);
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            attributes: { class: "milkdown-doc", spellcheck: "false" },
          }));
          ctx.get(listenerCtx).markdownUpdated((_, markdown, prev) => {
            if (markdown !== prev) onChange(markdown);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use($view(imageSchema.node, () => createImageNodeView(baseDir)))
        .use(listener)
        .use(clipboard)
        .use(cursor)
        .use(prism)
        .use(math),
    [],
  );

  return <Milkdown />;
}

/** 把 milkdown 实例注册到块插入桥 */
function MilkdownBridge() {
  const [loading, get] = useInstance();
  useEffect(() => {
    registerMilkdown(() => (loading ? null : get()));
    return () => registerMilkdown(null);
  }, [loading, get]);
  return null;
}

export function MilkdownEditor(props: Props) {
  return (
    <MilkdownProvider>
      <MilkdownBridge />
      <MilkdownEditorInner {...props} />
    </MilkdownProvider>
  );
}
