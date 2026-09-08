import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Electron desktop packaging artifacts:
    "dist-desktop/**",
    "dist-desktop*/**",
    ".desktop-stage/**",
    "desktop/**",
    ".desktop-dev/**",
    ".desktop-test/**",
    ".next-*/**",
    "tests/desktop/*.cjs",
    "tests/visual-qa/**",
  ]),
]);

export default eslintConfig;
