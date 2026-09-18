import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@public": path.resolve(dirname, "./public"),
      "@classStyle": path.resolve(dirname, "./src/common/classStyle"),
      "@components": path.resolve(dirname, "./src/common/components"),
      "@consts": path.resolve(dirname, "./src/common/consts"),
      "@hooks": path.resolve(dirname, "./src/common/hooks"),
      "@types": path.resolve(dirname, "./src/common/types/index.ts"),
      "@utils": path.resolve(dirname, "./src/common/utils"),
      "@pages": path.resolve(dirname, "./src/pages"),
      "@assets": path.resolve(dirname, "./src/assets"),
      "@stores": path.resolve(dirname, "./src/stores"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
