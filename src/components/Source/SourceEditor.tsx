import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  foldKeymap,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { useEditorStore } from "../../stores/editorStore";
import { registerCmView } from "../../lib/blockInsert";

function cmTheme() {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "var(--bg)",
        color: "var(--fg)",
        fontSize: "14.5px",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "1.7",
        padding: "24px 8px 60px 0",
      },
      ".cm-content": { caretColor: "var(--accent)" },
      ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--accent)" },
      "&.cm-focused": { outline: "none" },
      ".cm-activeLine": { backgroundColor: "var(--bg-hover)" },
      ".cm-activeLineGutter": { backgroundColor: "var(--bg-hover)", color: "var(--fg)" },
      ".cm-gutters": {
        backgroundColor: "var(--bg)",
        color: "var(--fg-faint)",
        border: "none",
        fontSize: "12.5px",
      },
      ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "var(--bg-selection) !important",
      },
      ".cm-matchingBracket": {
        backgroundColor: "transparent",
        outline: "1px solid var(--border-strong)",
      },
      ".cm-searchMatch": { backgroundColor: "var(--accent-soft)" },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--bg-selection)" },
      ".cm-panels": { backgroundColor: "var(--bg-elevated)", color: "var(--fg)" },
    },
    { dark: false },
  );
}

interface Props {
  onChange: (doc: string) => void;
  onScrollRatio?: (ratio: number) => void;
}

export function SourceEditor({ onChange, onScrollRatio }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const file = useEditorStore.getState().file;
    const state = EditorState.create({
      doc: file?.content ?? "",
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        history(),
        EditorView.lineWrapping,
        cmTheme(),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    registerCmView(view);

    if (onScrollRatio) {
      const handler = () => {
        const el = view.scrollDOM;
        if (el.scrollHeight > el.clientHeight) {
          onScrollRatio(el.scrollTop / (el.scrollHeight - el.clientHeight));
        }
      };
      view.scrollDOM.addEventListener("scroll", handler, { passive: true });
      return () => {
        registerCmView(null);
        view.scrollDOM.removeEventListener("scroll", handler);
        view.destroy();
      };
    }

    view.focus();
    return () => {
      registerCmView(null);
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="source-editor" style={{ height: "100%" }} />;
}
