import path from "node:path";
import { defineConfig } from "vite";
const root = path.resolve(import.meta.dirname, "../../..");
export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: { "@": root } },
  esbuild: { jsx: "automatic" },
  build: { outDir: path.resolve(root, ".tmp-restaurant-browser-v188"), emptyOutDir: true },
});
