import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(rootDir, "src/renderer"),
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@shared": path.resolve(rootDir, "src/shared")
    }
  },
  build: {
    outDir: path.resolve(rootDir, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"]
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
