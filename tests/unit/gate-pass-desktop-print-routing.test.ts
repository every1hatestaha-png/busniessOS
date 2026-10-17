import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function desktopShortcut(path: string, printable = true) {
  const source = readFileSync("desktop/main.cjs", "utf8");
  const start = source.indexOf('  mainWindow.webContents.on("before-input-event"');
  const end = source.indexOf('  mainWindow.webContents.on("render-process-gone"', start);
  let handler!: (event: object, input: object) => Promise<void>;
  const window = { isDestroyed: () => false, loadURL: vi.fn().mockResolvedValue(undefined), webContents: {
    on: (_event: string, callback: typeof handler) => { handler = callback; },
    getURL: () => `https://www.munshios.tech${path}`, print: vi.fn(),
    executeJavaScript: vi.fn().mockResolvedValue(printable),
  } };
  runInNewContext(source.slice(start, end), {mainWindow:window,serverOrigin:"https://www.munshios.tech",URL,appendLog:vi.fn()});
  return { window, run: () => handler({preventDefault:vi.fn()},{type:"keyDown",key:"p",control:true}) };
}

describe("desktop Gate Pass Ctrl+P uses actual document routes", () => {
  it.each(["new", "pending-invoices", "in-transit"])("does not navigate %s to a nonexistent print document", async (segment) => {
    const shortcut = desktopShortcut(`/gate-passes/${segment}/`);
    await shortcut.run();
    expect(shortcut.window.loadURL).not.toHaveBeenCalled();
    expect(shortcut.window.webContents.print).toHaveBeenCalledOnce();
  });
  it("suppresses an unissued/cancelled/not-found document", async () => {
    const shortcut = desktopShortcut("/gate-passes/valid-id",false);
    await shortcut.run();
    expect(shortcut.window.loadURL).not.toHaveBeenCalled();
    expect(shortcut.window.webContents.print).not.toHaveBeenCalled();
  });
  it("still opens an issued document's dedicated print page", async () => {
    const shortcut = desktopShortcut("/gate-passes/valid-id");
    await shortcut.run();
    expect(shortcut.window.loadURL).toHaveBeenCalledWith("https://www.munshios.tech/gate-passes/valid-id/print");
  });
});
