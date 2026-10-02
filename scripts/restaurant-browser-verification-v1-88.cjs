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
        const success = new URLSearchParams(body).get("reason") === "Synthetic success";
        setTimeout(() => {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify(success ? { status: "success", message: "Synthetic mutation completed." } : { status: "error", message: "Refresh order history before trying again." }));
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
    const doubleSubmitRequests = requests;
    await page.locator('input[name="reason"]').fill("Synthetic success");
    await page.getByRole("button", { name: "Submit synthetic mutation" }).click();
    await page.getByRole("status").filter({ hasText: "Synthetic mutation completed." }).waitFor();
    assert.equal(requests, 2);
    await page.reload();
    await page.getByRole("button", { name: "Submit synthetic mutation" }).waitFor();
    assert.equal(requests, 2, "Refresh after success resubmitted a mutation");
    await page.goto(url + "/?kind=error");
    await page.getByRole("alert").waitFor();
    assert.ok((await page.getByRole("alert").textContent()).includes("check order, payment or return history"));
    await page.getByRole("button", { name: "Reload restaurant page" }).click();
    await page.getByRole("button", { name: "Submit synthetic mutation" }).waitFor();
    await page.goto(url + "/?kind=error");
    await page.goBack();
    await page.getByRole("button", { name: "Submit synthetic mutation" }).waitFor();
    assert.equal(requests, 2, "Back navigation resubmitted a mutation");
    await page.getByRole("button", { name: "Submit synthetic mutation" }).click();
    await page.waitForFunction(() => document.querySelector("fieldset")?.disabled === true);
    const deadline = Date.now() + 5_000;
    while (requests < 3 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(requests, 3);
    await page.reload();
    await page.getByRole("button", { name: "Submit synthetic mutation" }).waitFor();
    assert.equal(requests, 3, "Refresh during a mutation issued another request");
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
    await page.evaluate(() => { document.documentElement.dataset.printFormat = "thermal"; });
    const kotDimensions = await page.locator("[data-document]").evaluate((node) => ({ width: node.getBoundingClientRect().width, scroll: node.scrollWidth, client: node.clientWidth }));
    assert.ok(kotDimensions.width <= 273 && kotDimensions.scroll <= kotDimensions.client + 1, "KOT thermal content overflows horizontally");
    await page.pdf({ path: path.join(root, "synthetic-kot-80mm.pdf"), width: "80mm", height: "297mm", printBackground: true });
    assert.deepEqual(errors, [], "Browser runtime errors");
    console.log(JSON.stringify({ result: "PASS", scope: "isolated React form, error boundary and print harness, no provider auth or live server actions", doubleSubmitRequests, totalSyntheticRequests: requests, refreshDuringMutation: "PASS", refreshAfterSuccess: "PASS", backNavigation: "PASS", errorReset: "PASS", thermalDimensions: dimensions, kotDimensions, browserErrors: errors.length }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
