import { flushAutosave, hasPendingAutosave } from "./autosave";

function hasTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

/**
 * 关窗前把最后 800ms 内的编辑落盘。
 *
 * 自动保存是防抖的，用户敲完立刻关窗会丢掉最后一段输入；
 * 这里拦截 close 事件，flush 完再真正关闭（用 allowNextClose 防止死循环）。
 */
export function installCloseGuard(): () => void {
  const cleanups: (() => void)[] = [];
  let allowNextClose = false;

  if (hasTauri()) {
    let unlisten: (() => void) | null = null;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          if (allowNextClose || !hasPendingAutosave()) return;
          event.preventDefault();
          await flushAutosave();
          allowNextClose = true;
          await win.close();
        });
      })
      .catch(() => {});
    cleanups.push(() => unlisten?.());
  }

  // 浏览器预览 / 打包外场景的兜底
  const onPageHide = () => {
    void flushAutosave();
  };
  window.addEventListener("pagehide", onPageHide);
  cleanups.push(() => window.removeEventListener("pagehide", onPageHide));

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
