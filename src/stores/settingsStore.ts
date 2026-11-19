import { create } from "zustand";

export type ThemeName = "light" | "sepia" | "dark" | "midnight";
export type ThemeSetting = ThemeName | "system";

interface SettingsState {
  theme: ThemeSetting;
  fontSize: number;
  sidebarVisible: boolean;
  outlineVisible: boolean;
  splitPreview: boolean;
  setTheme: (t: ThemeSetting) => void;
  setFontSize: (n: number) => void;
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
