import { createHighlighter, type Highlighter } from "shiki";

const LIGHT_THEME = "github-light";
const DARK_THEME = "github-dark";

const LANGS = [
  "typescript",
  "javascript",
  "tsx",
  "json",
  "bash",
  "shell",
  "python",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "csharp",
  "html",
  "css",
  "markdown",
  "yaml",
  "toml",
  "sql",
  "xml",
  "diff",
] as const;

let highlighter: Highlighter | null = null;
let loading: Promise<Highlighter> | null = null;

export function isHighlighterReady() {
  return highlighter !== null;
}

export async function ensureHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter;
  if (!loading) {
    loading = createHighlighter({
      themes: [LIGHT_THEME, DARK_THEME],
      langs: [...LANGS],
    }).then((h) => {
      highlighter = h;
      return h;
    });
  }
  return loading;
}

export function highlightCode(code: string, lang: string, dark: boolean): string {
  if (!highlighter) return "";
  const resolved = (highlighter.getLoadedLanguages() as string[]).includes(lang)
    ? lang
    : "text";
  return highlighter.codeToHtml(code, {
    lang: resolved,
    theme: dark ? DARK_THEME : LIGHT_THEME,
  });
}
