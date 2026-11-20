import { flushAutosave, hasPendingAutosave } from "./autosave";

function hasTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

/** flush 最多等这么久，宁可丢掉最后 800ms 的编辑也不能卡住关窗 */
const FLUSH_TIMEOUT = 1500;

/**
 * 关窗前把最后 800ms 内的编辑落盘。
 *
 * 自动保存是防抖的，用户敲完立刻关窗会丢掉最后一段输入；
 * 这里拦截 close 事件，flush 完再真正关闭。
 *
 * 注意 Tauri 的 onCloseRequested 在 handler 没有 preventDefault 时会自己调用
 * window.destroy()，而调用 close() 会再次触发 close-requested 事件；
 * 所以拦截之后一律用 destroy() 直接销毁窗口，避免重入和被权限/挂起卡住。
 */
export function installCloseGuard(): () => void {
  const cleanups: (() => void)[] = [];

  if (hasTauri()) {
    let unlisten: (() => void) | null = null;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          // 没有待保存内容时不要拦截，交给 Tauri 默认关闭
          if (!hasPendingAutosave()) return;

          event.preventDefault();
          try {
            await Promise.race([
              flushAutosave(),
              new Promise<void>((resolve) => window.setTimeout(resolve, FLUSH_TIMEOUT)),
            ]);
          } catch (error) {
            console.error("关窗前保存失败:", error);
          }
          // destroy 不会再触发 close-requested，真正做到「点了就关」
          await win.destroy();
        });
      })
      .catch((error) => {
        console.error("注册关窗钩子失败:", error);
      });
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
