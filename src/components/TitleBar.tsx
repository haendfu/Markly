import { useEffect, useState } from "react";
import { PanelLeft, Moon, Sun, Monitor, Code2, BookOpen, Pencil, FolderOpen, FileText, List, Download, ArrowLeft, ArrowRight } from "lucide-react";
import { ExportDialog } from "./Export/ExportDialog";
import { open } from "@tauri-apps/plugin-dialog";
import { useEditorStore } from "../stores/editorStore";
import { useSettingsStore, type ThemeSetting } from "../stores/settingsStore";
import { pickAndOpenMarkdownFile } from "../lib/tauri/files";
import { useLibraryStore } from "../stores/libraryStore";
import { clsx } from "clsx";

const THEMES: { value: ThemeSetting; icon: typeof Sun; label: string }[] = [
  { value: "system", icon: Monitor, label: "跟随系统" },
  { value: "light", icon: Sun, label: "浅色" },
  { value: "dark", icon: Moon, label: "深色" },
];

export function TitleBar() {
  // 一律用选择器订阅：file 对象每次输入都会变，整店订阅会让标题栏跟着重渲染
  const mode = useEditorStore((s) => s.mode);
  const fileName = useEditorStore((s) => s.file?.name ?? null);
  const dirty = useEditorStore((s) => s.dirty);
  const historyIdx = useEditorStore((s) => s.historyIdx);
  const historyLen = useEditorStore((s) => s.history.length);
  const setMode = useEditorStore((s) => s.setMode);
  const openFile = useEditorStore((s) => s.openFile);
  const goBack = useEditorStore((s) => s.goBack);
  const goForward = useEditorStore((s) => s.goForward);

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const sidebarVisible = useSettingsStore((s) => s.sidebarVisible);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);
  const toggleOutline = useSettingsStore((s) => s.toggleOutline);

  const [exportOpen, setExportOpen] = useState(false);
  const hasFile = fileName !== null;

  useEffect(() => {
    const open = () => setExportOpen(true);
    window.addEventListener("markly:export", open);
    return () => window.removeEventListener("markly:export", open);
  }, []);

  return (
    <header className="titlebar">
      <button
        className={clsx("titlebar-btn", sidebarVisible && "active")}
        title="切换侧栏 (Ctrl+\)"
        onClick={toggleSidebar}
      >
        <PanelLeft size={17} />
      </button>

      <button
        className="titlebar-btn"
        title="后退 (Alt+←)"
        disabled={historyIdx <= 0}
        style={historyIdx <= 0 ? { opacity: 0.4, cursor: "default" } : undefined}
        onClick={() => goBack()}
      >
        <ArrowLeft size={17} />
      </button>
      <button
        className="titlebar-btn"
        title="前进 (Alt+→)"
        disabled={historyIdx >= historyLen - 1}
        style={historyIdx >= historyLen - 1 ? { opacity: 0.4, cursor: "default" } : undefined}
        onClick={() => goForward()}
      >
        <ArrowRight size={17} />
      </button>

      <button
        className="titlebar-btn"
        title="打开文件"
        onClick={async () => {
          const f = await pickAndOpenMarkdownFile();
          if (f) openFile(f);
        }}
      >
        <FileText size={17} />
      </button>

      <button
        className="titlebar-btn"
        title="打开文件夹"
        onClick={async () => {
          const dir = await open({
            title: "打开文件夹",
            directory: true,
            multiple: false,
          });
          if (typeof dir === "string") {
            useLibraryStore.getState().openLibrary(dir);
            useSettingsStore.getState().setSidebarVisible(true);
          }
        }}
      >
        <FolderOpen size={17} />
      </button>

      <span className="titlebar-title">
        {fileName ? fileName + (dirty ? " •" : "") : "Markly"}
      </span>

      <div className="titlebar-spacer" />

      {/* 模式切换 */}
      {hasFile && (
        <div className="flex items-center gap-1">
          <button
            className={clsx("titlebar-btn", outlineVisible && "active")}
            title="大纲"
            onClick={toggleOutline}
          >
            <List size={16} />
          </button>
          <button
            className={clsx("titlebar-btn", mode === "read" && "active")}
            title="阅读模式"
            onClick={() => setMode("read")}
          >
            <BookOpen size={16} />
          </button>
          <button
            className={clsx("titlebar-btn", mode === "wysiwyg" && "active")}
            title="所见即所得编辑"
            onClick={() => setMode("wysiwyg")}
          >
            <Pencil size={16} />
          </button>
          <button
            className={clsx("titlebar-btn", mode === "source" && "active")}
            title="源码模式"
            onClick={() => setMode("source")}
          >
            <Code2 size={16} />
          </button>
        </div>
      )}

      {hasFile && (
        <button
          className="titlebar-btn"
          title="导出 (Ctrl+P)"
          onClick={() => setExportOpen(true)}
        >
          <Download size={16} />
        </button>
      )}

      {/* 主题 */}
      <div className="flex items-center gap-1 ml-2 pl-2" style={{ borderLeft: "1px solid var(--border)" }}>
        {THEMES.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            className={clsx("titlebar-btn", theme === value && "active")}
            title={label}
            onClick={() => setTheme(value)}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </header>
  );
}
