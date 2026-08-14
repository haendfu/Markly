import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Scissors, Copy, ClipboardPaste, ExternalLink, Link2, Image, ZoomIn,
  Pencil, Trash2, FolderPlus, FilePlus, type LucideIcon,
} from "lucide-react";
import { clsx } from "clsx";
import { useContextMenu } from "../../stores/contextMenuStore";

const ICONS: Record<string, LucideIcon> = {
  cut: Scissors,
  copy: Copy,
  paste: ClipboardPaste,
  openLink: ExternalLink,
  copyLink: Link2,
  copyImage: Image,
  zoom: ZoomIn,
  rename: Pencil,
  delete: Trash2,
  newFolder: FolderPlus,
  newNote: FilePlus,
};

export function ContextMenu() {
  const { open, x, y, items, hide } = useContextMenu();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => hide();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, hide]);

  if (!open || items.length === 0) return null;

  // 防止溢出屏幕
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - items.length * 32 - 24),
  };

  return createPortal(
    <div ref={ref} className="context-menu" style={style} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-sep" />
        ) : (
          <button
            key={i}
            className={clsx("context-item", item.danger && "danger", item.disabled && "disabled")}
            disabled={item.disabled}
            onClick={() => {
              hide();
              item.action?.();
            }}
          >
            {item.icon && ICONS[item.icon]
              ? (() => {
                  const Icon = ICONS[item.icon];
                  return <Icon size={14} />;
                })()
              : null}
            <span>{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
