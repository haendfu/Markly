import { create } from "zustand";

export interface MenuItem {
  label?: string;
  icon?: string; // lucide 图标名，由组件映射
  danger?: boolean;
  separator?: boolean;
  disabled?: boolean;
  action?: () => void;
}

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  show: (x: number, y: number, items: MenuItem[]) => void;
  hide: () => void;
}

export const useContextMenu = create<ContextMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  items: [],
  show: (x, y, items) => set({ open: true, x, y, items }),
  hide: () => set({ open: false }),
}));
