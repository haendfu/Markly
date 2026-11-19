import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 编辑器/工具写文件时会留 .tmpdir 与 .tmp，W: 这类盘上 chokidar 监视它们会 EBUSY
      // 直接打挂整个 dev server，这里统一忽略。
      ignored: ["**/src-tauri/**", "**/*.tmpdir/**", "**/*.tmp"],
    },
  },
});
