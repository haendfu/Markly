import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MenuItem } from "../stores/contextMenuStore";

function isEditable(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  return el.isContentEditable;
}

function hasSelection(): boolean {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().length > 0;
}

async function copySelection(cut: boolean) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const text = sel.toString();
  try {
    await writeText(text);
    if (cut && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
    }
  } catch {
    document.execCommand(cut ? "cut" : "copy");
  }
}

async function pasteToTarget() {
  try {
    const text = await readText();
    document.execCommand("insertText", false, text);
  } catch {
    document.execCommand("paste");
  }
}

/**
 * 根据右键目标构建 Markly 菜单项：
 * 编辑区/选区 → 剪切/复制/粘贴；链接 → 打开/复制；图片 → 预览/复制
 */
export function buildContentMenu(
  target: HTMLElement,
  previewImage: (src: string) => void,
): MenuItem[] {
  const items: MenuItem[] = [];
  const link = target.closest("a");
  const img = target.closest("img");
  const editable = isEditable(target);

  if (link) {
    const href = link.getAttribute("href") ?? "";
    if (/^https?:/i.test(href)) {
      items.push(
        { label: "打开链接", icon: "openLink", action: () => openUrl(href).catch(console.error) },
        {
          label: "复制链接地址",
          icon: "copyLink",
          action: () => writeText(href).catch(console.error),
        },
        { separator: true },
      );
    }
  }

  if (img && img.closest(".markdown-body, .milkdown-doc")) {
    items.push(
      { label: "放大预览", icon: "zoom", action: () => previewImage(img.src) },
      {
        label: "复制图片地址",
        icon: "copyImage",
        action: () => writeText(img.getAttribute("src") ?? img.src).catch(console.error),
      },
      { separator: true },
    );
  }

  const canEdit = editable;
  if (hasSelection()) {
    items.push({ label: "剪切", icon: "cut", action: () => copySelection(true), disabled: !canEdit });
    items.push({ label: "复制", icon: "copy", action: () => copySelection(false) });
  } else if (canEdit) {
    items.push({ label: "剪切", icon: "cut", disabled: true });
    items.push({ label: "复制", icon: "copy", disabled: true });
  }
  if (canEdit) {
    items.push({ label: "粘贴", icon: "paste", action: () => pasteToTarget() });
  }

  return items;
}
