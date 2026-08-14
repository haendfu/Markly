import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { prism } from "@milkdown/plugin-prism";
import { math } from "@milkdown/plugin-math";

interface Props {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}

function MilkdownEditorInner({ initialMarkdown, onChange }: Props) {
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
        .use(listener)
        .use(clipboard)
        .use(cursor)
        .use(prism)
        .use(math),
    [],
  );

  return <Milkdown />;
}

export function MilkdownEditor(props: Props) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner {...props} />
    </MilkdownProvider>
  );
}
