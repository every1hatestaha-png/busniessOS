import path from "node:path";
import { defineConfig } from "vite";
const root = path.resolve(import.meta.dirname, "../../..");
export default defineConfig({
  define: { "process.env": JSON.stringify({ NODE_ENV: "production" }) },
  root: import.meta.dirname,
  resolve: { alias: [
    { find: "@/app/(dashboard)/restaurant/v1-actions", replacement: path.resolve(import.meta.dirname, "synthetic-actions.ts") },
    { find: "@", replacement: root },
  ] },
  esbuild: { jsx: "automatic" },
  build: { outDir: path.resolve(root, ".tmp-restaurant-browser-v188"), emptyOutDir: true },
});
