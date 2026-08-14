# Markly

一款追求苹果级审美的 Markdown 阅读器与编辑器，专注沉浸阅读体验。

![平台](https://img.shields.io/badge/平台-Windows-blue) ![框架](https://img.shields.io/badge/框架-Tauri%202%20%2B%20React%2019-green) ![许可](https://img.shields.io/badge/状态-MVP-orange)

## 特性

### 阅读优先
- **默认沉浸阅读模式**：打开文件即为纯净排版（780px 居中栏、1.75 行高、克制留白）
- **4 套主题**：浅色 / 牛皮纸 / 深色 / 纯黑（OLED），可跟随系统，CSS 变量驱动无闪烁切换
- **图片灯箱**：双击放大，滚轮缩放、拖拽平移

### 三种编辑模式（Ctrl+E 循环切换）
| 模式 | 说明 |
|---|---|
| 阅读 | 只读渲染，显式「编辑」入口防误触 |
| 所见即所得 | Milkdown（ProseMirror），光标处显示 Markdown 源码 |
| 源码 | CodeMirror 6，可开分屏实时预览 + 滚动同步 |

### 完整的 Markdown 支持
- GFM（表格、任务列表、删除线）、脚注
- **KaTeX 数学公式**（行内与块级）
- **Mermaid 图表**（流程图、时序图、甘特图等）
- **Shiki 代码高亮**（VS Code 级，20+ 语言，随主题切换亮暗）

### 文件管理
- 文件库：树形浏览、新建/重命名/删除（移入回收站）、文件名搜索
- 外部修改自动监听刷新
- **导航历史**：标题栏前进/后退 + Alt+←/→
- **会话恢复**：重启后回到上次的文件、模式与滚动位置
- 双击 md 文件在已有窗口打开（单实例）

### 导出
- **HTML**：自包含单文件（内嵌主题变量、KaTeX 字体 base64、Mermaid SVG、代码高亮样式），零外部请求
- **PDF**：经打印对话框另存，带分页优化规则

### 其它
- 中文界面、自定义右键菜单（不继承浏览器菜单）
- 自动保存（800ms 防抖，保留原文件换行风格）
- 快捷键：Ctrl+S 保存 / Ctrl+E 切模式 / Ctrl+P 导出 / Ctrl+\ 侧栏 / F11 后续支持
- 安装包**免管理员权限**，注册 `.md/.markdown/.mdown/.mkd` 右键「用 Markly 打开」

## 快捷键

| 按键 | 功能 |
|---|---|
| Ctrl+E | 阅读 → 所见即所得 → 源码 循环切换 |
| Ctrl+S | 立即保存 |
| Ctrl+P | 导出（HTML / PDF） |
| Ctrl+\ | 显示/隐藏侧栏 |
| Alt+← / Alt+→ | 后退 / 前进 |
| Esc | 关闭灯箱/对话框 |

## 从源码构建

环境要求：Node 20+、Rust（MSVC 工具链）、VS Build Tools（C++ 工作负载）。

```bash
npm install       # 安装依赖
npm run tauri dev # 开发模式（热重载）

# 一键打包（Windows 下直接双击 build.bat）
npm run build:release
# 产物在 release/：
#   Markly_0.1.0_x64-setup.exe  NSIS 离线安装包（内嵌 WebView2）
#   Markly-Portable.zip         便携版
```

> 国内网络若 NSIS 工具链下载失败，设置代理后重试：
> `set HTTPS_PROXY=http://127.0.0.1:7890 && npm run build:release`

## 技术栈

- **外壳**：Tauri 2（Rust）+ WebView2
- **前端**：React 19 + TypeScript + Zustand + Tailwind v4 + CSS 变量设计令牌
- **渲染管线**：markdown-it 14 + Shiki 4 + KaTeX + Mermaid 11（阅读/预览/导出共用同一管线，保证三处渲染一致）
- **编辑器**：Milkdown 7（WYSIWYG）/ CodeMirror 6（源码）

## 目录结构

```
src/
├── components/     # Reader / Wysiwyg / Source / Sidebar / Outline / Export / Menu / Viewer
├── lib/markdown/   # 统一渲染管线（renderer / shiki / mermaid / exportHtml）
├── lib/tauri/      # 文件读写、保存、链接处理封装
├── stores/         # zustand：editor / library / settings / contextMenu
└── styles/         # 设计令牌 + 4 主题 + 排版（阅读与导出共用）
src-tauri/
├── nsis/hooks.nsh  # 右键「用 Markly 打开」注册钩子
└── src/            # Rust：插件注册、回收站删除、单实例、启动参数
```

## License

MIT
