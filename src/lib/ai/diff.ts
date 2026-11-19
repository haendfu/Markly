/**
 * 行级 diff（Myers），供「AI 改文档」的 review 窗口使用。
 *
 * 只做行粒度：文档体量在几千行以内，行级足够看清改动；
 * 超大文档（> 4000 行总量）直接退化成「整篇替换」一个 hunk，
 * 避免 Myers 的 O(ND) 在整篇重写时把界面卡死。
 */

export interface DiffLineOp {
  kind: "equal" | "del" | "ins";
  text: string;
  /** 所属 hunk 编号；-1 表示不在任何 hunk 里（纯上下文、始终保留） */
  hunk: number;
  /** 旧文件行号（1 起，del/equal 有效） */
  oldNo: number;
  /** 新文件行号（1 起，ins/equal 有效） */
  newNo: number;
}

export interface DiffHunk {
  id: number;
  ops: DiffLineOp[];
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  adds: number;
  dels: number;
}

export interface DiffResult {
  ops: DiffLineOp[];
  hunks: DiffHunk[];
  adds: number;
  dels: number;
}

const MAX_MYERS_LINES = 4000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.split("\n");
}

type OpKind = "equal" | "del" | "ins";

/** 经典 Myers：返回逐行的操作序列 */
function myers(a: string[], b: string[]): OpKind[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];
  const offset = max + 1;
  const size = 2 * max + 3;
  const v = new Int32Array(size);
  const trace: Int32Array[] = [];
  const idx = (k: number) => k + offset;

  let foundAt = -1;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[idx(k - 1)] < v[idx(k + 1)])) {
        x = v[idx(k + 1)];
      } else {
        x = v[idx(k - 1)] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[idx(k)] = x;
      if (x >= n && y >= m) {
        foundAt = d;
        break;
      }
    }
    if (foundAt >= 0) break;
  }

  const ops: OpKind[] = [];
  let x = n;
  let y = m;
  for (let d = foundAt; d >= 0; d--) {
    const vd = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vd[idx(k - 1)] < vd[idx(k + 1)])) prevK = k + 1;
    else prevK = k - 1;
    const prevX = vd[idx(prevK)];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push("equal");
      x--;
      y--;
    }
    if (d === 0) break;
    if (x === prevX) {
      ops.push("ins");
      y--;
    } else {
      ops.push("del");
      x--;
    }
  }
  return ops.reverse();
}

export function diffText(before: string, after: string): DiffResult {
  const a = splitLines(before);
  const b = splitLines(after);

  const kinds: OpKind[] =
    a.length + b.length > MAX_MYERS_LINES
      ? [...a.map((): OpKind => "del"), ...b.map((): OpKind => "ins")]
      : myers(a, b);

  // 逐行展开，带上新旧行号
  const ops: DiffLineOp[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const kind of kinds) {
    if (kind === "equal") {
      const text = a[oldNo - 1];
      ops.push({ kind, text, hunk: -1, oldNo, newNo });
      oldNo++;
      newNo++;
    } else if (kind === "del") {
      const text = a[oldNo - 1];
      ops.push({ kind, text, hunk: -1, oldNo, newNo });
      oldNo++;
    } else {
      const text = b[newNo - 1];
      ops.push({ kind, text, hunk: -1, oldNo, newNo });
      newNo++;
    }
  }

  // 找改动块，按「间隔 ≤ 6 行相同内容则合并」聚成 hunk（各自带 3 行上下文）
  const changeIdx: number[] = [];
  ops.forEach((op, i) => {
    if (op.kind !== "equal") changeIdx.push(i);
  });

  const hunks: DiffHunk[] = [];
  const CONTEXT = 3;
  let groupStart = -1;
  let groupEnd = -1;
  const pushGroup = () => {
    if (groupStart < 0) return;
    const from = Math.max(0, groupStart - CONTEXT);
    const to = Math.min(ops.length - 1, groupEnd + CONTEXT);
    const id = hunks.length;
    const slice = ops.slice(from, to + 1);
    for (const op of slice) op.hunk = id;
    const dels = slice.filter((o) => o.kind === "del").length;
    const adds = slice.filter((o) => o.kind === "ins").length;
    const first = slice[0];
    const oldStart = first.oldNo;
    const newStart = first.newNo;
    hunks.push({
      id,
      ops: slice,
      oldStart,
      oldCount: slice.filter((o) => o.kind !== "ins").length,
      newStart,
      newCount: slice.filter((o) => o.kind !== "del").length,
      adds,
      dels,
    });
    groupStart = -1;
    groupEnd = -1;
  };

  for (const i of changeIdx) {
    if (groupStart < 0) {
      groupStart = i;
      groupEnd = i;
      continue;
    }
    const gap = i - groupEnd - 1;
    if (gap <= CONTEXT * 2) {
      groupEnd = i;
    } else {
      pushGroup();
      groupStart = i;
      groupEnd = i;
    }
  }
  pushGroup();

  return {
    ops,
    hunks,
    adds: ops.filter((o) => o.kind === "ins").length,
    dels: ops.filter((o) => o.kind === "del").length,
  };
}

/** 按被接受的 hunk 编号，把 diff 应用成新文本；未接受的部分保留原文 */
export function applyDiff(ops: DiffLineOp[], accepted: Set<number>): string {
  const out: string[] = [];
  for (const op of ops) {
    const takeNew = op.hunk === -1 || accepted.has(op.hunk);
    if (op.kind === "equal") out.push(op.text);
    else if (op.kind === "del") {
      if (!takeNew) out.push(op.text);
    } else if (takeNew) {
      out.push(op.text);
    }
  }
  return out.join("\n");
}
