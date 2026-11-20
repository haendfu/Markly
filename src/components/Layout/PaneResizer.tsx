import { useCallback, useRef } from "react";
import { PANE_LIMITS, useSettingsStore, type PaneId } from "../../stores/settingsStore";

/**
 * 分栏拖拽条：放在相邻两栏之间，左右拖动调整宽度。
 *
 * 左栏（sidebar）向右拖变宽，右栏（outline / ai）向左拖变宽，
 * 所以两者用不同的方向系数。宽度写进 settingsStore，同时更新 CSS 变量。
 * 双击恢复默认宽度，聚焦后也可以用方向键微调。
 */
export function PaneResizer({ pane, label }: { pane: PaneId; label: string }) {
  const width = useSettingsStore((s) => s.paneWidths[pane]);
  const setPaneWidth = useSettingsStore((s) => s.setPaneWidth);
  const resetPaneWidth = useSettingsStore((s) => s.resetPaneWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const direction = pane === "sidebar" ? 1 : -1;
  const { min, max } = PANE_LIMITS[pane];

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // 只处理主键，避免右键/中键误触发
      if (event.button !== 0) return;
      event.preventDefault();
      drag.current = { startX: event.clientX, startWidth: width };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add("pane-resizing");
    },
    [width],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state) return;
      const next = state.startWidth + (event.clientX - state.startX) * direction;
      setPaneWidth(pane, next);
    },
    [direction, pane, setPaneWidth],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    document.body.classList.remove("pane-resizing");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div
      className="pane-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      title={`拖动调整${label}宽度，双击恢复默认`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => resetPaneWidth(pane)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 24 : 8;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setPaneWidth(pane, width - step * direction);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          setPaneWidth(pane, width + step * direction);
        } else if (event.key === "Home") {
          event.preventDefault();
          resetPaneWidth(pane);
        }
      }}
    />
  );
}
