import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { isNewerVersion, parseSha256, parseStableVersion, selectReleaseAssets } = require("../../desktop/updater.cjs");

describe("desktop updater helpers", () => {
  it("compares stable semantic versions safely", () => {
    expect(parseStableVersion("v0.2.2")).toEqual([0, 2, 2]);
    expect(parseStableVersion("0.2.2")).toEqual([0, 2, 2]);
    expect(parseStableVersion("0.2.2-beta.1")).toBeNull();
    expect(isNewerVersion("0.2.2", "0.2.1")).toBe(true);
    expect(isNewerVersion("0.2.1", "0.2.1")).toBe(false);
    expect(isNewerVersion("0.1.9", "0.2.1")).toBe(false);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
  });

  it("requires a stable release with an installer and matching checksum asset", () => {
    const release = {
      draft: false,
      prerelease: false,
      assets: [
        { name: "MunshiOS Setup 0.2.2.exe", browser_download_url: "https://example.com/setup.exe" },
        { name: "MunshiOS Setup 0.2.2.exe.sha256", browser_download_url: "https://example.com/setup.exe.sha256" },
      ],
    };
    expect(selectReleaseAssets(release)).toEqual({ installer: release.assets[0], checksum: release.assets[1] });
    expect(selectReleaseAssets({ ...release, draft: true })).toBeNull();
    expect(selectReleaseAssets({ ...release, prerelease: true })).toBeNull();
    expect(selectReleaseAssets({ ...release, assets: [release.assets[0]] })).toBeNull();
  });

  it("parses SHA-256 manifests only for the expected installer", () => {
    const hash = "a".repeat(64);
    expect(parseSha256(`${hash}  MunshiOS Setup 0.2.2.exe\n`, "MunshiOS Setup 0.2.2.exe")).toBe(hash);
    expect(parseSha256(`${hash}  Other.exe\n`, "MunshiOS Setup 0.2.2.exe")).toBeNull();
    expect(parseSha256(hash, "MunshiOS Setup 0.2.2.exe")).toBe(hash);
    expect(parseSha256("not-a-checksum", "MunshiOS Setup 0.2.2.exe")).toBeNull();
  });
});
