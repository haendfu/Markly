// 生成 1024x1024 应用图标 PNG（纯 Node，无依赖）：圆角方块 + "M" 字形
import zlib from "node:zlib";
import fs from "node:fs";

const SIZE = 1024;
const R = 230; // 圆角半径
const cx = SIZE / 2, cy = SIZE / 2;

function insideRounded(x, y) {
  const min = 0, max = SIZE;
  if (x < min || x > max || y < min || y > max) return false;
  const rx = Math.max(min + R, Math.min(max - R, x));
  const ry = Math.max(min + R, Math.min(max - R, y));
  const dx = x - rx, dy = y - ry;
  return dx * dx + dy * dy <= R * R;
}

// "M" 字形：两条斜线 + 中间竖线，用点到线段距离
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx2 = x1 + t * dx, cy2 = y1 + t * dy;
  return Math.hypot(px - cx2, py - cy2);
}

function onM(x, y, w) {
  const s = 300; // half-width of glyph box
  const x0 = cx - s, x1 = cx + s, yTop = cy - s * 0.9, yBot = cy + s * 0.9;
  return (
    distSeg(x, y, x0, yTop, x0, yBot) < w ||
    distSeg(x, y, x0, yTop, cx, cy + s * 0.1) < w ||
    distSeg(x, y, cx, cy + s * 0.1, x1, yTop) < w ||
    distSeg(x, y, x1, yTop, x1, yBot) < w
  );
}

// 渐变背景 #5E5CE6 -> #7D7AFF（紫罗兰），白色 M
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0; // filter none
  for (let x = 0; x < SIZE; x++) {
    const i = rowStart + 1 + x * 4;
    let r = 94, g = 92, b = 230, a = 255;
    if (!insideRounded(x, y)) {
      a = 0;
    } else {
      const t = (x + y) / (2 * SIZE);
      r = Math.round(94 + (125 - 94) * t);
      g = Math.round(92 + (122 - 92) * t);
      b = Math.round(230 + (255 - 230) * t);
      if (onM(x, y, 62)) { r = 255; g = 255; b = 255; }
    }
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
  }
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.mkdirSync("src-tauri/icons", { recursive: true });
fs.writeFileSync("src-tauri/icons/app-icon.png", png);
fs.writeFileSync("public/markly.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#5E5CE6"/><path d="M16 44V20l16 14 16-14v24" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
console.log("icon written:", png.length, "bytes");
