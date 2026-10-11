import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { checkPasswordAgainstBreaches } from "@/lib/server/password-breach-check";

const password = "SyntheticLongPassword#2026";
const digest = createHash("sha1").update(password).digest("hex").toUpperCase();
const prefix = digest.slice(0, 5);
const suffix = digest.slice(5);

afterEach(() => vi.unstubAllGlobals());

describe("private HIBP k-anonymous password screening", () => {
  it("rejects a matching leaked hash without sending password or full hash", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(`${suffix}:187\r\n`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkPasswordAgainstBreaches(password)).resolves.toBe("compromised");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${prefix}`);
    expect(String(url)).not.toContain(password);
    expect(String(url)).not.toContain(digest);
    expect(init.headers).toMatchObject({ "Add-Padding": "true" });
    expect(init.cache).toBe("no-store");
  });
  it("allows a non-matching suffix and ignores padded zero-count entries", async () => {
    const other = suffix === "A".repeat(35) ? "B".repeat(35) : "A".repeat(35);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`${other}:40\n${suffix}:0\n`, { status: 200 })));
    await expect(checkPasswordAgainstBreaches(password)).resolves.toBe("safe");
  });
  it("fails closed on provider outage, invalid response and short passwords", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider unavailable")));
    await expect(checkPasswordAgainstBreaches(password)).resolves.toBe("unavailable");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("error", { status: 503 })));
    await expect(checkPasswordAgainstBreaches(password)).resolves.toBe("unavailable");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    await expect(checkPasswordAgainstBreaches(password)).resolves.toBe("unavailable");
    await expect(checkPasswordAgainstBreaches("too-short")).resolves.toBe("unavailable");
  });
});
