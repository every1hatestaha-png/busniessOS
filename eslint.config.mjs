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
  {
    rules: {
      // Prevent accidental imports from desktop/ in web code.
      // Desktop code is preserved for future desktop release but should not be
      // imported by web components, pages, or server logic.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["desktop/**"],
              message:
                "Importing from 'desktop/**' is not allowed in web code. Desktop code is isolated for the future desktop release. If you need shared functionality, move it to lib/ or components/.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
