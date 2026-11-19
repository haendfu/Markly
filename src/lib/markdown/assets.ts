import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * 图片等本地资源地址解析。
 *
 * 约定：文档里的相对路径以「文档所在目录」为根（与 Typora / VS Code / GitHub 一致），
 * 绝对路径（`C:\...`、`\\server\...`、`file:///...`）原样使用。
 * WebView 无法直接加载本地文件，统一经 Tauri asset 协议（convertFileSrc）转换。
 */

/** 是否运行在 Tauri 宿主里（纯浏览器预览时为 false） */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

/** markdown-it 会对属性值做 HTML 转义，处理前先还原 */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** 逐段解码 %xx；非法编码时保留原文 */
export function decodeUri(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

type PathStyle = "win" | "posix";

function detectStyle(p: string): PathStyle {
  if (/^[a-zA-Z]:/.test(p)) return "win";
  if (p.startsWith("\\\\") || p.startsWith("//")) return "win";
  if (p.includes("\\")) return "win";
  return "posix";
}

/**
 * 归一化文件路径：合并分隔符、消解 `.` 与 `..`，保留盘符 / UNC 前缀。
 */
export function normalizeFsPath(input: string): string {
  const style = detectStyle(input);
  const sep = style === "win" ? "\\" : "/";
  const trimmed = input.trim();

  // 先剥离前缀再折叠分隔符，否则 UNC 的前导 \\ 会被压成单个反斜杠
  let prefix = "";
  let rest = trimmed;
  if (style === "win") {
    if (/^[a-zA-Z]:/.test(trimmed)) {
      prefix = trimmed.slice(0, 2);
      rest = trimmed.slice(2);
    } else if (/^[\\/]{2}/.test(trimmed)) {
      const segs = trimmed.slice(2).split(/[\\/]+/);
      prefix = `\\\\${segs.slice(0, 2).join("\\")}`;
      rest = segs.slice(2).join("\\");
    }
  }
  rest = rest.replace(style === "win" ? /[\\/]+/g : /\/+/g, sep);

  const rooted = rest.startsWith(sep);
  const out: string[] = [];
  for (const seg of rest.split(sep)) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  const body = out.join(sep);

  if (prefix) return body ? `${prefix}${sep}${body}` : `${prefix}${sep}`;
  return `${rooted ? sep : ""}${body}`;
}

/** 以目录为基准拼接相对路径 */
export function joinFsPath(dir: string, rel: string): string {
  const style = detectStyle(dir) === "win" || detectStyle(rel) === "win" ? "win" : "posix";
  const sep = style === "win" ? "\\" : "/";
  const base = dir.replace(/[\\/]+$/, "");
  return normalizeFsPath(base ? `${base}${sep}${rel}` : rel);
}

/** 盘符根目录，如 `W:\`；非盘符路径返回 null */
export function driveRootOf(path: string): string | null {
  const m = /^([a-zA-Z]):/.exec(path.trim());
  return m ? `${m[1]}:\\` : null;
}

function fileUrlToPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    let p = decodeURIComponent(parsed.pathname);
    // file:///C:/x → C:/x
    if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
    if (!p) return null;
    return normalizeFsPath(p);
  } catch {
    return null;
  }
}

/**
 * 把文档中的本地资源地址解析为绝对文件路径。
 * 远程地址（http/https/data/asset/blob…）或无法解析时返回 null。
 */
export function resolveLocalPath(src: string, baseDir: string | null): string | null {
  const raw = decodeEntities(src).trim();
  if (!raw || raw.startsWith("#")) return null;

  // 先解码：markdown-it 会把反斜杠转成 %5C（`C:\a\b.png` → `C:%5Ca%5Cb.png`），
  // 不解码就认不出盘符；同时去掉查询串与锚点（中文/空格路径也在此还原）。
  const decoded = decodeUri(raw.split(/[?#]/)[0]).trim();
  if (!decoded) return null;

  // 盘符绝对路径
  if (/^[a-zA-Z]:[\\/]/.test(decoded)) return normalizeFsPath(decoded);
  // UNC 路径
  if (decoded.startsWith("\\\\")) return normalizeFsPath(decoded);
  // 带协议的地址：只处理 file://，其余（http/data/asset/blob…）原样交给 WebView
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) {
    return /^file:/i.test(decoded) ? fileUrlToPath(decoded) : null;
  }
  if (decoded.startsWith("//")) return null; // 协议相对 URL

  // 以 / 或 \ 开头：视为「文档所在盘符的根」
  if (/^[\\/]/.test(decoded)) {
    const root = baseDir ? driveRootOf(baseDir) : null;
    const rel = decoded.replace(/^[\\/]+/, "");
    return root ? normalizeFsPath(`${root}${rel}`) : normalizeFsPath(decoded);
  }

  if (!baseDir) return normalizeFsPath(decoded);
  return joinFsPath(baseDir, decoded);
}

/** 绝对文件路径 → WebView 可加载的 URL（Tauri asset 协议；浏览器预览退化为 file://） */
export function toAssetUrl(path: string): string {
  if (isTauri()) {
    try {
      return convertFileSrc(path);
    } catch {
      /* 回退到 file:// */
    }
  }
  const posix = normalizeFsPath(path).replace(/\\/g, "/");
  return `file:///${encodeURI(posix).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

/** 解析图片地址；远程地址返回 null 表示保持原样 */
export function resolveImageSrc(src: string, baseDir: string | null): string | null {
  const abs = resolveLocalPath(src, baseDir);
  return abs ? toAssetUrl(abs) : null;
}

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_ATTR_RE = /(\ssrc\s*=\s*)(?:"([^"]*)"|'([^']*)')/i;

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * 把渲染结果里的本地图片地址改写为 asset URL，并把原始地址保留在 data-src。
 * 覆盖 Markdown 语法与内嵌 HTML 两种写法（代码块内的内容已被转义，不会误伤）。
 */
export function rewriteImageSources(html: string, baseDir: string | null): string {
  if (!html.includes("<img")) return html;
  return html.replace(IMG_TAG_RE, (tag) => {
    if (/\sdata-src\s*=/i.test(tag)) return tag;
    const m = SRC_ATTR_RE.exec(tag);
    if (!m) return tag;
    const raw = m[2] ?? m[3] ?? "";
    const resolved = resolveImageSrc(raw, baseDir);
    if (!resolved) return tag;
    return tag.replace(
      SRC_ATTR_RE,
      () => `${m[1]}"${escapeAttr(resolved)}" data-src="${escapeAttr(raw)}"`,
    );
  });
}

/** 取图片的原始（文档内）地址：改写后的 img 优先用 data-src */
export function imageSourceOf(img: HTMLImageElement): string {
  return img.dataset.src ?? img.getAttribute("src") ?? img.src;
}

/**
 * 复制 / 展示用的可读地址：把 %xx 还原（`C:%5Ca%5Cb.png` → `C:\a\b.png`）。
 * 带协议的远程地址保持原样，避免改变其语义。
 */
export function displayImageSource(img: HTMLImageElement): string {
  const raw = imageSourceOf(img);
  // 单字母 scheme 视作盘符（`C:%5C...` 仍需解码），其余带协议的地址原样返回
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(raw);
  if (scheme && scheme[1].length > 1) return raw;
  return decodeUri(raw);
}
