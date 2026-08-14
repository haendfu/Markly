import { useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

/** 图片灯箱：滚轮缩放、拖拽平移、双击 1x/2.5x、Esc 关闭 */
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clampScale = (s: number) => Math.min(8, Math.max(0.2, s));

  return (
    <div
      className="lightbox"
      onWheel={(e) => {
        e.preventDefault();
        setScale((s) => clampScale(s * (e.deltaY < 0 ? 1.12 : 0.89)));
      }}
      onMouseDown={(e) => {
        drag.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
      }}
      onMouseMove={(e) => {
        if (!drag.current) return;
        setPos({
          x: drag.current.px + e.clientX - drag.current.sx,
          y: drag.current.py + e.clientY - drag.current.sy,
        });
      }}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          cursor: drag.current ? "grabbing" : "grab",
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (scale === 1) {
            setScale(2.5);
          } else {
            setScale(1);
            setPos({ x: 0, y: 0 });
          }
        }}
      />
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" title="缩小" onClick={() => setScale((s) => clampScale(s / 1.25))}>
          <ZoomOut size={16} />
        </button>
        <span className="lightbox-scale">{Math.round(scale * 100)}%</span>
        <button className="icon-btn" title="放大" onClick={() => setScale((s) => clampScale(s * 1.25))}>
          <ZoomIn size={16} />
        </button>
        <button
          className="icon-btn"
          title="重置"
          onClick={() => {
            setScale(1);
            setPos({ x: 0, y: 0 });
          }}
        >
          <RotateCcw size={15} />
        </button>
        <button className="icon-btn" title="关闭 (Esc)" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
