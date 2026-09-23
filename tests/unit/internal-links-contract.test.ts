import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function filesUnder(dir: string): string[] {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absolute)) {
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(relative(root, path)));
    else out.push(relative(root, path).split(sep).join("/"));
  }
  return out;
}

function routePatternFromPage(path: string): RegExp | null {
  if (!path.startsWith("app/") || (!path.endsWith("/page.tsx") && path !== "app/page.tsx")) return null;
  const raw = path === "app/page.tsx" ? [] : path.slice(4, -9).split("/");
  const segments = raw.filter((segment) => {
    if (!segment) return false;
    if (/^\(.+\)$/.test(segment)) return false;
    if (segment.startsWith("@")) return false;
    return true;
  });

  const pattern = segments.map((segment) => {
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return ".*";
    if (/^\[\.\.\..+\]$/.test(segment)) return ".+";
    if (/^\[.+\]$/.test(segment)) return "[^/]+";
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");

  return new RegExp(`^/${pattern}${pattern ? "/?" : ""}$`);
}

function normalizeInternalHref(value: string) {
  const withoutExpression = value.replace(/\$\{[^}]+\}/g, "__dynamic__");
  const withoutQuery = withoutExpression.split(/[?#]/, 1)[0] ?? "";
  return withoutQuery || "/";
}

function internalHrefs(source: string): string[] {
  const found: string[] = [];
  const literal = /href\s*=\s*["'](\/[^"']*)["']/g;
  const template = /href\s*=\s*\{\s*`(\/[^`]*)`\s*\}/g;
  for (const matcher of [literal, template]) {
    for (const match of source.matchAll(matcher)) found.push(normalizeInternalHref(match[1]));
  }
  return found;
}

describe("internal navigation links", () => {
  it("keeps hard-coded application links backed by a real Next.js page route", () => {
    const routePatterns = filesUnder("app")
      .map(routePatternFromPage)
      .filter((value): value is RegExp => Boolean(value));

    const sourceFiles = [...filesUnder("app"), ...filesUnder("components")]
      .filter((path) => /\.(tsx|ts)$/.test(path));

    const broken: string[] = [];
    for (const path of sourceFiles) {
      const source = readFileSync(join(root, path), "utf8");
      for (const href of internalHrefs(source)) {
        if (href.startsWith("/api/") || href.startsWith("/_next/") || href === "/") continue;
        if (!routePatterns.some((pattern) => pattern.test(href))) broken.push(`${path} -> ${href}`);
      }
    }

    expect(broken, `Broken internal links:\n${broken.join("\n")}`).toEqual([]);
  });
});