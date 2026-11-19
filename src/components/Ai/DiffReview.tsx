import { useEffect, useMemo, useState } from "react";
import { useAiStore } from "../../stores/aiStore";
import type { DiffHunk } from "../../lib/ai/diff";

function hunkTitle(hunk: DiffHunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * 类似 VS Code 的 diff review：逐 hunk 勾选后再写回文件。
 * 未勾选的 hunk 保持原样（删除保留、插入丢弃）。
 */
export function DiffReview() {
  const proposal = useAiStore((s) => s.proposal);
  const setProposal = useAiStore((s) => s.setProposal);
  const applyProposal = useAiStore((s) => s.applyProposal);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!proposal) return;
    setAccepted(new Set(proposal.hunks.map((hunk) => hunk.id)));
    setApplying(false);
  }, [proposal]);

  useEffect(() => {
    if (!proposal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProposal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proposal, setProposal]);

  const totalAdds = useMemo(
    () => proposal?.hunks.reduce((sum, hunk) => sum + hunk.adds, 0) ?? 0,
    [proposal],
  );
  const totalDels = useMemo(
    () => proposal?.hunks.reduce((sum, hunk) => sum + hunk.dels, 0) ?? 0,
    [proposal],
  );

  if (!proposal) return null;

  const toggleHunk = (id: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const apply = async () => {
    setApplying(true);
    try {
      await applyProposal(accepted);
    } finally {
      setApplying(false);
    }
  };

  const nothingChanged = proposal.hunks.length === 0;

  return (
    <div className="ai-diff-overlay" onClick={() => setProposal(null)}>
      <div className="ai-diff" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header className="ai-diff-head">
          <div className="ai-diff-title">
            <span className="ai-diff-file">{basename(proposal.path)}</span>
            <span className="ai-diff-path" title={proposal.path}>
              {proposal.path}
            </span>
          </div>
          <div className="ai-diff-stats">
            <span className="ai-stat-add">+{totalAdds}</span>
            <span className="ai-stat-del">−{totalDels}</span>
            <span className="ai-diff-hunks">{proposal.hunks.length} 处改动</span>
          </div>
          <button className="ai-icon-btn" onClick={() => setProposal(null)} title="关闭（Esc）">
            ✕
          </button>
        </header>

        <div className="ai-diff-tools">
          <button
            className="ai-text-btn"
            onClick={() => setAccepted(new Set(proposal.hunks.map((hunk) => hunk.id)))}
          >
            全选
          </button>
          <button className="ai-text-btn" onClick={() => setAccepted(new Set())}>
            全不选
          </button>
          <span className="ai-diff-hint">勾选的改动会写入文件，未勾选的部分保持原样</span>
        </div>

        <div className="ai-diff-body">
          {nothingChanged && <div className="ai-diff-empty">模型给出的内容与当前文件一致，没有需要应用的修改。</div>}
          {proposal.hunks.map((hunk) => {
            const checked = accepted.has(hunk.id);
            return (
              <section key={hunk.id} className={`ai-hunk ${checked ? "accepted" : "rejected"}`}>
                <header className="ai-hunk-head">
                  <label className="ai-hunk-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleHunk(hunk.id)}
                    />
                    <span className="ai-hunk-range">{hunkTitle(hunk)}</span>
                  </label>
                  <span className="ai-hunk-count">
                    <span className="ai-stat-add">+{hunk.adds}</span>
                    <span className="ai-stat-del">−{hunk.dels}</span>
                  </span>
                </header>
                <div className="ai-hunk-lines">
                  {hunk.ops.map((op, index) => (
                    <div key={`${hunk.id}-${index}`} className={`ai-line ai-line-${op.kind}`}>
                      <span className="ai-line-no">{op.kind === "ins" ? "" : op.oldNo}</span>
                      <span className="ai-line-no">{op.kind === "del" ? "" : op.newNo}</span>
                      <span className="ai-line-sign">
                        {op.kind === "ins" ? "+" : op.kind === "del" ? "−" : " "}
                      </span>
                      <span className="ai-line-text">{op.text || " "}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="ai-diff-foot">
          <span className="ai-diff-target">写入：{basename(proposal.path)}</span>
          <div className="ai-diff-actions">
            <button className="ai-btn" onClick={() => setProposal(null)}>
              取消
            </button>
            <button
              className="ai-btn primary"
              onClick={() => void apply()}
              disabled={applying || accepted.size === 0}
            >
              {applying ? "应用中…" : `应用 ${accepted.size} 处修改`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
