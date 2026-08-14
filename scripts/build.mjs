// Markly 一键打包：node scripts/build.mjs
// 产物（release/ 目录）：
//   Markly-Setup-x64.exe   — NSIS 离线安装包（内嵌 WebView2 安装器）
//   Markly-Portable.zip    — 便携版（需系统已有 WebView2，Win10/11 一般自带）
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

// 确保 rustup 的 cargo 在 PATH 中
const cargoBin = join(homedir(), ".cargo", "bin");
if (existsSync(cargoBin)) {
  process.env.PATH = `${cargoBin};${process.env.PATH}`;
}

const root = resolve(import.meta.dirname, "..");
const tauriCli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const targetDir = join(root, "src-tauri", "target", "release");
const bundleDir = join(targetDir, "bundle");
const outDir = join(root, "release");

console.log("==> 构建 Tauri 应用（NSIS 离线安装包）…");
execFileSync(process.execPath, [tauriCli, "build"], { stdio: "inherit", cwd: root });

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 1. NSIS 安装包
const nsisDir = join(bundleDir, "nsis");
if (existsSync(nsisDir)) {
  const setup = readdirSync(nsisDir).find((f) => f.endsWith("-setup.exe"));
  if (setup) {
    cpSync(join(nsisDir, setup), join(outDir, setup.replace(/^markly/i, "Markly")));
    console.log("安装包:", setup);
  }
}

// 2. 便携版
const portableDir = join(outDir, "Markly-Portable");
mkdirSync(portableDir, { recursive: true });
cpSync(join(targetDir, "markly.exe"), join(portableDir, "Markly.exe"));
cpSync(join(root, "public", "markly.svg"), join(portableDir, "markly.svg"));
const readme = `Markly 便携版
=============

直接运行 Markly.exe 即可，无需安装。

注意：便携版不含 WebView2 运行时。
Windows 10（较新版本）与 Windows 11 一般已内置；
若提示无法启动，请安装 WebView2 Runtime：
https://developer.microsoft.com/microsoft-edge/webview2/

数据（设置/主题）保存在 %APPDATA%\\com.markly.app。
`;
writeFileSync(join(portableDir, "README.txt"), readme);

console.log("==> 压缩便携版…");
execFileSync("powershell", [
  "-NoProfile", "-Command",
  `Compress-Archive -Path "${portableDir}\\*" -DestinationPath "${join(outDir, "Markly-Portable.zip")}" -Force`,
]);
rmSync(portableDir, { recursive: true, force: true });

console.log("\n完成！产物目录: release/");
for (const f of readdirSync(outDir)) console.log("  -", f);
