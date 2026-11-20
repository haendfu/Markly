import { create } from "zustand";

export type ThemeName = "light" | "sepia" | "dark" | "midnight";
export type ThemeSetting = ThemeName | "system";

/** 三栏 + AI 面板的可拖动宽度 */
export type PaneId = "sidebar" | "outline" | "ai";

export const PANE_LIMITS: Record<PaneId, { min: number; max: number; fallback: number }> = {
  sidebar: { min: 200, max: 520, fallback: 284 },
  outline: { min: 160, max: 420, fallback: 230 },
  ai: { min: 300, max: 760, fallback: 384 },
};

interface SettingsState {
  theme: ThemeSetting;
  fontSize: number;
  sidebarVisible: boolean;
  outlineVisible: boolean;
  splitPreview: boolean;
  paneWidths: Record<PaneId, number>;
  setTheme: (t: ThemeSetting) => void;
  setFontSize: (n: number) => void;
  setPaneWidth: (pane: PaneId, px: number) => void;
  resetPaneWidth: (pane: PaneId) => void;
  setSidebarVisible: (v: boolean) => void;
  toggleSidebar: () => void;
  setOutlineVisible: (v: boolean) => void;
  toggleOutline: () => void;
  setSplitPreview: (v: boolean) => void;
}

function applyTheme(setting: ThemeSetting) {
  let name: ThemeName;
  if (setting === "system") {
    name = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    name = setting;
  }
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem("markly:theme", name);
}

function applyFontSize(px: number) {
  document.documentElement.style.setProperty("--content-font-size", `${px}px`);
}

const storedFontSize = Number(localStorage.getItem("markly:font-size"));
const initialFontSize = Number.isFinite(storedFontSize) && storedFontSize >= 12 ? storedFontSize : 17;
applyFontSize(initialFontSize);

/** 栏宽存成 CSS 变量，布局用 var() 读取，拖拽时只改变量不触发布局重算 */
function applyPaneWidth(pane: PaneId, px: number) {
  document.documentElement.style.setProperty(`--${pane}-width`, `${px}px`);
}

function clampPaneWidth(pane: PaneId, px: number): number {
  const { min, max } = PANE_LIMITS[pane];
  return Math.min(max, Math.max(min, Math.round(px)));
}

function readPaneWidth(pane: PaneId): number {
  const { fallback } = PANE_LIMITS[pane];
  const stored = Number(localStorage.getItem(`markly:${pane}-width`));
  return Number.isFinite(stored) && stored > 0 ? clampPaneWidth(pane, stored) : fallback;
}

const initialPaneWidths: Record<PaneId, number> = {
  sidebar: readPaneWidth("sidebar"),
  outline: readPaneWidth("outline"),
  ai: readPaneWidth("ai"),
};
for (const pane of Object.keys(initialPaneWidths) as PaneId[]) {
  applyPaneWidth(pane, initialPaneWidths[pane]);
}

export function resolveCurrentTheme(): ThemeName {
  return (document.documentElement.getAttribute("data-theme") as ThemeName) || "light";
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: (localStorage.getItem("markly:theme-setting") as ThemeSetting) || "system",
  fontSize: initialFontSize,
  // 默认隐藏侧栏（沉浸阅读）；仅当用户显式展开过才记住展开
  sidebarVisible: localStorage.getItem("markly:sidebar") === "visible",
  outlineVisible: localStorage.getItem("markly:outline") === "visible",
  splitPreview: localStorage.getItem("markly:split") !== "hidden",
  paneWidths: initialPaneWidths,
  setTheme: (t) => {
    localStorage.setItem("markly:theme-setting", t);
    applyTheme(t);
    set({ theme: t });
  },
  setFontSize: (n) => {
    const px = Math.min(24, Math.max(13, Math.round(n)));
    localStorage.setItem("markly:font-size", String(px));
    applyFontSize(px);
    set({ fontSize: px });
  },
  setPaneWidth: (pane, px) => {
    const width = clampPaneWidth(pane, px);
    localStorage.setItem(`markly:${pane}-width`, String(width));
    applyPaneWidth(pane, width);
    set((state) => ({ paneWidths: { ...state.paneWidths, [pane]: width } }));
  },
  resetPaneWidth: (pane) => {
    const width = PANE_LIMITS[pane].fallback;
    localStorage.removeItem(`markly:${pane}-width`);
    applyPaneWidth(pane, width);
    set((state) => ({ paneWidths: { ...state.paneWidths, [pane]: width } }));
  },
  setSidebarVisible: (v) => {
    localStorage.setItem("markly:sidebar", v ? "visible" : "hidden");
    set({ sidebarVisible: v });
  },
  toggleSidebar: () => get().setSidebarVisible(!get().sidebarVisible),
  setOutlineVisible: (v) => {
    localStorage.setItem("markly:outline", v ? "visible" : "hidden");
    set({ outlineVisible: v });
  },
  toggleOutline: () => get().setOutlineVisible(!get().outlineVisible),
  setSplitPreview: (v) => {
    localStorage.setItem("markly:split", v ? "visible" : "hidden");
    set({ splitPreview: v });
  },
}));

// 初始化：应用存储的主题设置，并跟随系统切换
export function initTheme() {
  const { theme } = useSettingsStore.getState();
  applyTheme(theme);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if (useSettingsStore.getState().theme === "system") applyTheme("system");
  });
}
