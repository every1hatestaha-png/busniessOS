import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const json = (name: string) => JSON.parse(readFileSync(resolve(root, name), "utf8"));

describe("Restaurant security and design dependency invariants", () => {
  it("does not reinstall the vulnerable unused shadcn CLI or deepmerge", () => {
    const pkg = json("package.json");
    const lock = json("package-lock.json");
    expect(pkg.devDependencies?.shadcn).toBeUndefined();
    expect(lock.packages[""].devDependencies?.shadcn).toBeUndefined();
    expect(lock.packages["node_modules/shadcn"]).toBeUndefined();
    expect(lock.packages["node_modules/deepmerge"]).toBeUndefined();
    expect(Object.keys(lock.packages).some(path => path.startsWith("node_modules/shadcn/"))).toBe(false);
  });

  it("retains exact-versioned local styles instead of importing the CLI", () => {
    const globals = readFileSync(resolve(root, "app/globals.css"), "utf8");
    const styles = readFileSync(resolve(root, "app/shadcn-v4.19.0.css"), "utf8");
    expect(globals).toContain('@import "./shadcn-v4.19.0.css"');
    expect(globals).not.toContain('@import "shadcn/tailwind.css"');
    expect(styles).toContain("@theme inline");
    expect(styles.length).toBeGreaterThan(15000);
  });

  it("keeps reviewed patch versions and registry SHA-512 integrity pinned", () => {
    const lock = json("package-lock.json");
    for (const [name, version] of [
      ["ip-address", "10.7.4"],
      ["systeminformation", "5.33.16"],
      ["@hono/node-server", "2.1.3"],
    ]) {
      const entry = lock.packages[`node_modules/${name}`];
      expect(entry.version).toBe(version);
      expect(entry.resolved).toBe(`https://registry.npmjs.org/${name}/-/${name.split("/").pop()}-${version}.tgz`);
      expect(entry.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
    }
  });

  it("does not retain outdated advisory exceptions", () => {
    const audit = readFileSync(resolve(root, "scripts/restaurant-audit-dev-advisories-v1-96.cjs"), "utf8");
    expect(audit).toContain("const expectedAdvisories = new Set([])");
  });
});
