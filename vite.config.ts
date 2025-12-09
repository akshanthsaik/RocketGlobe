import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from 'vite-plugin-cesium';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), cesium()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
