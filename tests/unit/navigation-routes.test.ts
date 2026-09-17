import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const appRoot = join(root, "app");
const sourceRoots = [join(root, "app"), join(root, "components")];

function walkFiles(dir: string, files: string[] = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walkFiles(full, files);
    else if (/\.(?:tsx|ts)$/.test(entry)) files.push(full);
  }
  return files;
}

function routePatternFromPage(pageFile: string) {
  const rel = relative(appRoot, pageFile).split(sep).join("/");
  const segments = rel
    .replace(/(?:^|\/)page\.tsx$/, "")
    .split("/")
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));

  const parts = segments.map((segment) => {
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return "(?:/.*)?";
    if (/^\[\.\.\..+\]$/.test(segment)) return "/.+";
    if (/^\[.+\]$/.test(segment)) return "/[^/]+";
    return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  });

  return new RegExp(`^${parts.join("") || "/"}/?$`);
}

const pagePatterns = walkFiles(appRoot)
  .filter((file) => file.endsWith(`${sep}page.tsx`))
  .map(routePatternFromPage);

function hasPageForPath(pathname: string) {
  return pagePatterns.some((pattern) => pattern.test(pathname));
}

function collectLiteralInternalHrefs() {
  const hrefs = new Map<string, string[]>();
  const hrefRegex = /href\s*=\s*["'](\/[A-Za-z0-9_./#?=-]*)["']/g;

  for (const sourceRoot of sourceRoots) {
    for (const file of walkFiles(sourceRoot)) {
      const source = readFileSync(file, "utf8");
      let match: RegExpExecArray | null;
      while ((match = hrefRegex.exec(source))) {
        const raw = match[1];
        if (!raw || raw.startsWith("//")) continue;
        const pathname = raw.split(/[?#]/, 1)[0] || "/";
        const refs = hrefs.get(pathname) ?? [];
        refs.push(relative(root, file).split(sep).join("/"));
        hrefs.set(pathname, refs);
      }
    }
  }

  return hrefs;
}

describe("literal internal navigation routes", () => {
  it("does not point Link/anchor hrefs at missing app pages", () => {
    const allowedNonPagePaths = new Set([
      "/api/health",
      "/api/webhooks/clerk",
    ]);

    const broken = [...collectLiteralInternalHrefs().entries()]
      .filter(([pathname]) => !allowedNonPagePaths.has(pathname))
      .filter(([pathname]) => !hasPageForPath(pathname))
      .map(([pathname, files]) => `${pathname} <- ${[...new Set(files)].join(", ")}`)
      .sort();

    expect(broken, `Broken literal internal navigation:\n${broken.join("\n")}`).toEqual([]);
  });
});
