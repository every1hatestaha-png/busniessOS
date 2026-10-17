import path from "node:path";
import { defineConfig } from "vite";
const root = path.resolve(import.meta.dirname, "../../..");
export default defineConfig({
  root: import.meta.dirname,
  define: { "process.env": JSON.stringify({ NODE_ENV: "production" }) },
  resolve: { alias: [
    {find:"next/navigation",replacement:path.join(import.meta.dirname,"navigation.ts")},
    {find:"@/app/(dashboard)/gate-passes/lifecycle-actions",replacement:path.join(import.meta.dirname,"actions.ts")},
    { find: "@", replacement: root },
  ] },
  esbuild: { jsx: "automatic" },
  build: { outDir: path.resolve(root, ".tmp-gatepass-browser-print"), emptyOutDir: true },
});
