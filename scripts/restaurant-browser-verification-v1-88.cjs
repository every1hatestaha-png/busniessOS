/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(__dirname, "../.tmp-restaurant-browser-v188");
  let requests = 0;
  const submittedWorkspaces = [];
  const server = http.createServer((request, response) => {
    if (request.url === "/synthetic-mutation") {
      requests++;
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        submittedWorkspaces.push(new URLSearchParams(body).get("formWorkspaceId"));
        setTimeout(() => {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ status: "error", message: "Refresh order history before trying again." }));
        }, 800);
      });
      return;
    }
    const file = path.resolve(root, "." + new URL(request.url, "http://localhost").pathname);
    const target = file === root ? path.join(root, "index.html") : file;
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) { response.writeHead(404); response.end(); return; }
    const extension = path.extname(target);
    response.writeHead(200, { "Content-Type": extension === ".js" ? "text/javascript" : extension === ".css" ? "text/css" : "text/html" });
    response.end(fs.readFileSync(target));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.getByRole("button", { name: "Submit synthetic mutation" }).waitFor();
    await page.evaluate(() => { const form = document.querySelector("form"); form.requestSubmit(); form.requestSubmit(); });
    await page.waitForFunction(() => document.querySelector("fieldset")?.disabled === true);
    assert.equal(await page.getByRole("button", { name: "Submit synthetic mutation" }).isDisabled(), true);
    await page.getByRole("alert").waitFor();
    assert.equal(requests, 1, "Double submit issued another mutation");
    assert.deepEqual(submittedWorkspaces, ["synthetic-workspace"]);
    assert.equal(await page.getByRole("button", { name: "Submit synthetic mutation" }).isEnabled(), true);
    assert.equal((await page.getByRole("alert").textContent()), "Refresh order history before trying again.");
    await page.reload();
    await page.getByRole("button", { name: "Submit synthetic mutation" }).waitFor();
    assert.equal(requests, 1, "Refresh resubmitted a mutation");
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => { document.documentElement.dataset.printFormat = "thermal"; });
    const dimensions = await page.locator("[data-document]").evaluate((node) => ({ width: node.getBoundingClientRect().width, scroll: node.scrollWidth, client: node.clientWidth }));
    assert.ok(dimensions.width <= 273, "Thermal surface exceeds 72mm");
    assert.ok(dimensions.scroll <= dimensions.client + 1, "Thermal content overflows horizontally");
    const receipt = await page.locator("[data-document]").textContent();
    for (const token of ["REPRINT COPY", "CANCELLED", "VOID", "Remaining balance", "SYNTHETIC-RR-100"]) assert.ok(receipt.includes(token));
    await page.pdf({ path: path.join(root, "synthetic-receipt-80mm.pdf"), width: "80mm", height: "297mm", printBackground: true });
    await page.goto(url + "/?kind=kot");
    await page.getByText("KITCHEN COPY").waitFor();
    const kot = await page.locator("[data-document]").textContent();
    assert.ok(kot.includes("Extra sauce") && kot.includes("No onions"));
    assert.ok(!kot.includes("BANK TRANSFER") && !kot.includes("Remaining balance"));
    assert.deepEqual(errors, [], "Browser runtime errors");
    console.log(JSON.stringify({ result: "PASS", scope: "isolated React form and print harness, no provider auth or live server actions", doubleSubmitRequests: requests, thermalDimensions: dimensions, browserErrors: errors.length }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
