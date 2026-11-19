import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { useEditorStore } from "../../stores/editorStore";
import { useOutline } from "../../hooks/useOutline";

function activeContainer(): HTMLElement | null {
  return (
    document.querySelector(".reader-view") ||
    document.querySelector(".split-preview") ||
    document.querySelector(".milkdown-doc") ||
    null
  );
}

/**
 * 找最近的滚动容器。
 * 不能直接用 parentElement：只有阅读模式的父节点才是 .content-area，
 * 源码分屏/所见即所得模式下父节点并不滚动，观察器会永远不触发。
 */
function scrollRootOf(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function OutlinePanel() {
  const content = useEditorStore((s) => s.file?.content ?? "");
  const mode = useEditorStore((s) => s.mode);
  const headings = useOutline(content);
  const [activeIdx, setActiveIdx] = useState(-1);
  const idxRef = useRef(activeIdx);
  idxRef.current = activeIdx;

  // IntersectionObserver 追踪当前可视标题
  useEffect(() => {
    const container = activeContainer();
    if (!container || headings.length === 0) return;
    const els = Array.from(container.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    if (els.length === 0) return;

    let settling = true;
    const timer = window.setTimeout(() => (settling = false), 600);

    const observer = new IntersectionObserver(
      (entries) => {
        if (settling) return;
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = els.indexOf(e.target as HTMLElement);
            if (i >= 0) setActiveIdx(i);
          }
        }
      },
      { root: scrollRootOf(container), rootMargin: "-10% 0px -80% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
    // 不依赖 content：每次输入都重建观察器会让 settling 永远为 true，高亮再也不更新
  }, [headings.length, mode]);
  if (headings.length === 0) {
    return <p className="sidebar-empty">无标题大纲</p>;
  }

  const scrollTo = (i: number) => {
    const container = activeContainer();
    if (!container) return;
    const els = container.querySelectorAll("h1,h2,h3,h4,h5,h6");
    els[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveIdx(i);
  };

  return (
    <nav className="outline-panel">
      {headings.map((h, i) => (
        <button
          key={i}
          className={clsx("outline-item", `outline-l${h.level}`, i === activeIdx && "active")}
          style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
          onClick={() => scrollTo(i)}
          title={h.text}
        >
          {h.text}
        </button>
      ))}
    </nav>
  );
}
