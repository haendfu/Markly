import { useState } from "react";
import { writeFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { X, FileCode2, FileText, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useEditorStore } from "../../stores/editorStore";
import { renderDocumentToHtml } from "../../lib/markdown/exportHtml";

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState<"html" | "pdf">("html");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useEditorStore((s) => s.file);

  const doExport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (format === "html") {
        const html = await renderDocumentToHtml({
          markdown: file.content,
          dir: file.dir,
          title: file.name,
        });
        const target = await save({
          title: "导出 HTML",
          defaultPath: file.name.replace(/\.(md|markdown|mdown|mkd)$/i, "") + ".html",
          filters: [{ name: "HTML", extensions: ["html"] }],
        });
        if (target) await writeFile(target, new TextEncoder().encode(html));
        onClose();
      } else {
        const html = await renderDocumentToHtml({
          markdown: file.content,
          dir: file.dir,
          title: file.name,
          autoPrint: true,
        });
        const dataDir = await appDataDir();
        const tmpPath = await join(dataDir, "export-print.html");
        await writeFile(tmpPath, new TextEncoder().encode(html));
        const win = new WebviewWindow("export-print", {
          url: convertFileSrc(tmpPath),
          title: "导出 PDF — 在打印对话框中选择「另存为 PDF」",
          width: 900,
          height: 700,
          center: true,
        });
        win.once("Destroyed", () => onClose());
        // 打印完成后自动关闭
        win.once("Created", () => {
          setTimeout(() => win.close(), 5 * 60 * 1000);
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>导出文档</h3>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="export-formats">
          <button
            className={clsx("export-format", format === "html" && "selected")}
            onClick={() => setFormat("html")}
          >
            <FileCode2 size={22} />
            <span>HTML</span>
            <small>自包含网页，含主题与字体</small>
          </button>
          <button
            className={clsx("export-format", format === "pdf" && "selected")}
            onClick={() => setFormat("pdf")}
          >
            <FileText size={22} />
            <span>PDF</span>
            <small>通过打印对话框另存</small>
          </button>
        </div>

        {error && <p className="export-error">{error}</p>}

        <div className="dialog-footer">
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={doExport} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : null}
            {busy ? "导出中…" : "导出"}
          </button>
        </div>
      </div>
    </div>
  );
}
