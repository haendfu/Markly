import { lazy, Suspense, useEffect, useState } from "react";
import { clsx } from "clsx";
import { initTheme, useSettingsStore } from "./stores/settingsStore";
import { useEditorStore } from "./stores/editorStore";
import { saveMarkdownFile } from "./lib/tauri/save";
import { TitleBar } from "./components/TitleBar";
import { ReaderView } from "./components/Reader/ReaderView";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { OutlinePanel } from "./components/Outline/OutlinePanel";
import { ContextMenu } from "./components/Menu/ContextMenu";
import { Lightbox } from "./components/Viewer/Lightbox";
import { useContextMenu, type MenuItem } from "./stores/contextMenuStore";
import { readMarkdownFile } from "./lib/tauri/files";
import { buildContentMenu } from "./lib/contextMenuBuilder";

const SourcePane = lazy(() =>
  import("./components/Source/SourcePane").then((m) => ({ default: m.SourcePane })),
);
const WysiwygPane = lazy(() =>
  import("./components/Wysiwyg/WysiwygPane").then((m) => ({ default: m.WysiwygPane })),
);

function EmptyState() {
  return (
    <div className="empty-state fade-in-up">
      <div className="logo">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      </div>
      <h2>欢迎使用 Markly</h2>
      <p>打开一个 Markdown 文件或文件夹，开始沉浸阅读</p>
    </div>
  );
}

/* ---------- 会话持久化 ---------- */

interface Session {
  path: string;
  mode: string;
  scrollTop: number;
}

function saveSession() {
  const { file, mode } = useEditorStore.getState();
  if (!file) {
    localStorage.removeItem("markly:session");
    return;
  }
  const scrollTop = document.querySelector(".content-area")?.scrollTop ?? 0;
  const s: Session = { path: file.path, mode, scrollTop };
  localStorage.setItem("markly:session", JSON.stringify(s));
}

async function restoreSession() {
  if (!(window as any).__TAURI_INTERNALS__) {
    // 浏览器开发预览
    try {
      const content = await (await fetch("/sample.md")).text();
      useEditorStore.getState().openFile({
        path: "/sample.md", name: "sample.md", dir: "/", content,
      });
    } catch {}
    return;
  }
  try {
    const raw = localStorage.getItem("markly:session");
    if (!raw) return;
    const s = JSON.parse(raw) as Session;
    const file = await readMarkdownFile(s.path);
    useEditorStore.getState().openFile(file, {
      mode: (["read", "wysiwyg", "source"] as const).includes(s.mode as any)
        ? (s.mode as any)
        : "read",
    });
    setTimeout(() => {
      document.querySelector(".content-area")?.scrollTo({ top: s.scrollTop });
    }, 400);
  } catch {
    /* 上次的文件已不存在 */
  }
}

/* ---------- 主组件 ---------- */

export default function App() {
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    initTheme();
    restoreSession();
    const saveTimer = window.setInterval(saveSession, 5000);
    window.addEventListener("beforeunload", saveSession);
    return () => {
      clearInterval(saveTimer);
      window.removeEventListener("beforeunload", saveSession);
      saveSession();
    };
  }, []);

  const file = useEditorStore((s) => s.file);
  const mode = useEditorStore((s) => s.mode);
  const sidebarVisible = useSettingsStore((s) => s.sidebarVisible);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);

  // 全局键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const s = useEditorStore.getState();
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        s.goBack();
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        s.goForward();
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        useSettingsStore.getState().toggleSidebar();
      } else if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        if (!s.file) return;
        s.setMode(s.mode === "read" ? "wysiwyg" : s.mode === "wysiwyg" ? "source" : "read");
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("markly:export"));
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (s.file && s.dirty) {
          saveMarkdownFile(s.file, s.file.content)
            .then(() => s.markSaved())
            .catch(console.error);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 自定义右键菜单 + 图片双击预览
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const items: MenuItem[] = buildContentMenu(e.target as HTMLElement, (src) =>
        setLightbox(src),
      );
      if (items.length > 0) {
        useContextMenu.getState().show(e.clientX, e.clientY, items);
      }
    };
    const onDblClick = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest("img");
      if (img && img.closest(".markdown-body, .milkdown-doc")) {
        e.preventDefault();
        setLightbox(img.src);
      }
    };
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dblclick", onDblClick);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dblclick", onDblClick);
    };
  }, []);

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <aside className={clsx("sidebar", !sidebarVisible && "collapsed")}>
          <Sidebar />
        </aside>
        <main className="content-area">
          {file ? (
            mode === "read" ? (
              <ReaderView />
            ) : (
              <Suspense fallback={null}>
                {mode === "source" ? <SourcePane /> : <WysiwygPane />}
              </Suspense>
            )
          ) : (
            <EmptyState />
          )}
        </main>
        {file && outlineVisible && (
          <aside className="outline-sidebar">
            <OutlinePanel />
          </aside>
        )}
      </div>
      <ContextMenu />
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
