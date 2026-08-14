# CLAUDE.md — Markly 开发指南

Markly 是 Tauri 2 + React 19 的 Windows 桌面 Markdown 应用（类 Typora，中文界面）。

## 本机命令怪癖（重要）

此机器的 Git Bash 中 **npx / npm run 派生的 CLI 会静默失败**（exit 0 但零输出）。必须直接调用 node：

```bash
node node_modules/@tauri-apps/cli/tauri.js dev          # 开发
node node_modules/typescript/bin/tsc -b                  # 类型检查（npx tsc 会假成功！）
node node_modules/vite/bin/vite.js build                 # 前端构建
node node_modules/vite-node/dist/cli.mjs scripts/xx.mjs  # 跑脚本
cargo check                                             # 需先 export PATH="$HOME/.cargo/bin:$PATH"
```

其它环境事实：
- 2026-08-14 已装 rustup（MSVC）+ VS Build Tools 2022；Node 24；无 pnpm
- GitHub 访问需代理：`git -c http.proxy=http://127.0.0.1:7890 push github main`
- 后台 vite 被 kill 后 node.exe 可能残留占用 1420 端口：`netstat -ano | grep 1420` + `taskkill //PID <pid> //F`

## Git 工作流

两个远端，提交后都要推：
- `gerrit` → `git push gerrit HEAD:refs/for/master`（Gerrit 禁止直推分支）
- `github` → 见上面代理命令

## 架构核心约定

### 1. 统一渲染管线（最重要）
阅读模式、源码分屏预览、导出 HTML **共用** `src/lib/markdown/renderer.ts`（markdown-it 单例）+ shiki.ts + mermaid.ts。任何渲染行为改动只能改这一处，禁止在视图组件里单独处理 Markdown。

### 2. 主题 = CSS 变量
- 所有颜色/字号/阴影语义在 `src/styles/tokens.css`（默认浅色）+ `themes.css`（sepia/dark/midnight 用 `[data-theme]` 覆盖）
- 主题切换 = 改 `html[data-theme]` 属性，无 React 参与；`index.html` 内联脚本防 FOUC
- Milkdown/CodeMirror/导出 HTML 全部消费同一套变量，保证四套主题下视觉一致
- **禁止在组件里写死颜色**，一律 `var(--xxx)`

### 3. 编辑器内核隔离
- WYSIWYG 只在 `src/components/Wysiwyg/MilkdownEditor.tsx` 触碰 Milkdown API（换内核只改此文件）
- WysiwygPane/SourcePane 均为懒加载路由组件，二者永不同时挂载
- 自动保存：编辑变更 → debounce 800ms → `saveMarkdownFile()`（保留原文件 CRLF/LF）

### 4. 状态
zustand stores：`editorStore`（模式/文件/导航历史）、`libraryStore`（文件树/CRUD/监听）、`settingsStore`（主题/字号/侧栏，localStorage 持久化）。组件内用选择器订阅，避免整树重渲染。

### 5. Tauri 权限
所有 IPC 能力在 `src-tauri/capabilities/default.json`（已含 fs:read-all/write-all、asset 协议、剪贴板）。Rust 命令：`trash_item`（回收站删除）、`startup_file`（双击文件启动参数）。

## 打包

```bash
node scripts/build.mjs   # 或双击 build.bat
```
产出 `release/`：NSIS 离线安装包（currentUser 免管理员）+ 便携版 zip。右键菜单注册在 `src-tauri/nsis/hooks.nsh`。NSIS 工具链首次下载需代理（HTTPS_PROXY）。

## 已知限制（改动前先了解）

- Windows 默认应用关联受 UserChoice 签名保护，无法静默设默认（已注册 ProgId + 右键菜单）
- Milkdown 对 HTML 注释/frontmatter 的 round-trip 可能损耗（frontmatter 未做预解析保留）
- PDF 导出走 WebView2 window.print()，用户需在打印对话框选「另存为 PDF」
