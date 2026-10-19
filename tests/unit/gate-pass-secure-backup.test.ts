import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const helper = path.resolve("scripts/gate-pass-secure-backup.mjs");
function normalize(value: string) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e",
    'const {normalizeWindowsDataDirectory}=await import(process.argv[1]); try {console.log(JSON.stringify({path:normalizeWindowsDataDirectory(process.argv[2])}));} catch {console.log(JSON.stringify({rejected:true}));}',
    pathToFileURL(helper).href, value], { encoding: "utf8", windowsHide: true, timeout: 5000 });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

describe("private Gate Pass backup restore safety", () => {
  it.each([
    ["C:/Program Files/PostgreSQL/18/data", "C:\\Program Files\\PostgreSQL\\18\\data"],
    ["C:\\Program Files\\PostgreSQL\\18\\data", "C:\\Program Files\\PostgreSQL\\18\\data"],
    ["d:/encrypted/pgdata/", "d:\\encrypted\\pgdata\\"],
  ])("accepts drive-absolute PostgreSQL path %s", (input, expected) => {
    expect(normalize(input)).toEqual({path:expected});
  });
  it.each([
    "/var/lib/postgresql", "relative/data", "C:relative", "//server/share/data",
    "\\\\server\\share\\data", "\\\\?\\C:\\data", "C:/data/../other", "C:/data/./other",
    "C:/data:stream", "C:/data\nother", "C:/data*", "C:/data?",
  ])("refuses unsafe restore path %s", (input) => {
    expect(normalize(input)).toEqual({rejected:true});
  });
  it("authenticates synthetic ciphertext and rejects corruption without production contact", () => {
    const result = spawnSync(process.execPath, [helper, "selftest"], {
      encoding:"utf8", windowsHide:true, timeout:10000,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ result:"PASS", tests:[
      "synthetic encrypted roundtrip", "plaintext hash", "GCM corruption rejection",
    ], productionContact:false });
  });
  it("retains encryption, loopback-only restore and failure evidence controls", () => {
    const source=readFileSync(helper,"utf8");
    expect(source).toContain("await encryptedRestoreDirectory(dataDirectory)");
    expect(source).toContain("Get-BitLockerVolume");
    expect(source).toContain("FullyEncrypted");
    expect(source).toContain("ReparsePoint");
    expect(source).toContain("'--host', '127.0.0.1'");
    expect(source).toContain("'--single-transaction'");
    expect(source).not.toContain("pgTool('dropdb')");
    expect(source).toContain("No automatic cleanup performed");
  });
});
