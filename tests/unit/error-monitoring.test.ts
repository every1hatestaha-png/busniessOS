import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportServerFailure } from "@/lib/server/error-monitoring";

afterEach(() => vi.restoreAllMocks());
describe("safe server failure monitoring", () => {
  it("logs only a bounded event and code, excluding exception text and metadata", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    reportServerFailure("api", new Prisma.PrismaClientKnownRequestError("password=secret customer@example.invalid", { code: "P2034", clientVersion: "test", meta: { token: "secret" } }));
    expect(log).toHaveBeenCalledExactlyOnceWith('{"event":"munshios.server_failure","area":"api","code":"P2034"}');
  });
  it("does not inspect arbitrary thrown objects or expose their contents", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    reportServerFailure("transaction", { get message() { throw new Error("must not read"); }, secret: "private" });
    expect(log).toHaveBeenCalledExactlyOnceWith('{"event":"munshios.server_failure","area":"transaction","code":"UNEXPECTED"}');
  });
});
