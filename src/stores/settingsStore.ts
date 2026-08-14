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

export function resolveCurrentTheme(): ThemeName {
  return (document.documentElement.getAttribute("data-theme") as ThemeName) || "light";
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: (localStorage.getItem("markly:theme-setting") as ThemeSetting) || "system",
  fontSize: 17,
  // 默认隐藏侧栏（沉浸阅读）；仅当用户显式展开过才记住展开
  sidebarVisible: localStorage.getItem("markly:sidebar") === "visible",
  outlineVisible: false,
  splitPreview: true,
  setTheme: (t) => {
    localStorage.setItem("markly:theme-setting", t);
    applyTheme(t);
    set({ theme: t });
  },
  setFontSize: (n) => set({ fontSize: n }),
  setSidebarVisible: (v) => {
    localStorage.setItem("markly:sidebar", v ? "visible" : "hidden");
    set({ sidebarVisible: v });
  },
  toggleSidebar: () => get().setSidebarVisible(!get().sidebarVisible),
  setOutlineVisible: (v) => set({ outlineVisible: v }),
  toggleOutline: () => set((s) => ({ outlineVisible: !s.outlineVisible })),
  setSplitPreview: (v) => set({ splitPreview: v }),
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
