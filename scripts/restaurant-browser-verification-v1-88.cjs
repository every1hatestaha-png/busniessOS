/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

function thermalPdfPages(file) {
  const boxes = [...fs.readFileSync(file).toString("latin1").matchAll(/\/MediaBox\s*\[([\d.\s]+)\]/g)].map((match) => match[1].trim().split(/\s+/).map(Number));
  assert.ok(boxes.length > 0, "PDF has no readable page boxes");
  for (const box of boxes) assert.ok(box[2]-box[0] >= 226 && box[2]-box[0] <= 228, "Thermal PDF uses an A4/fallback page width");
  return boxes.length;
}

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
    await page.goto(url + "/?kind=unguarded");
    await page.getByRole("button", { name: "Unguarded synthetic form" }).waitFor();
    await page.evaluate(() => { const form = document.querySelector("form"); form.requestSubmit(); form.requestSubmit(); });
    await page.waitForFunction(() => document.querySelector("form")?.dataset.pending === "true");
    await page.waitForFunction(() => document.querySelector("form")?.dataset.pending === "false" && document.querySelector('[role="alert"]'));
    assert.equal(requests, 5, "Previous pending-only stateful form did not reproduce the duplicate request");
    await page.goto(url + "/?kind=pos");
    await page.getByRole("button", { name: /Synthetic meal/ }).click();
    await page.evaluate(() => { const form = document.querySelector("form"); form.requestSubmit(); form.requestSubmit(); });
    await page.waitForFunction(() => document.querySelector("fieldset")?.disabled === true);
    assert.equal(await page.getByRole("button", { name: /Synthetic meal/ }).isDisabled(), true, "POS cart can change during a pending order");
    await page.getByRole("status").filter({ hasText: "Synthetic mutation completed." }).waitFor();
    assert.equal(requests, 6, "POS double submit created another request");
    assert.equal(await page.getByRole("button", { name: "Confirm & send to kitchen" }).isDisabled(), true, "Successful POS order leaves the old basket submit-ready");
    assert.equal(await page.getByText("Select menu items to start an order.").isVisible(), true);
    await page.goto(url);
    await page.getByRole("button", { name: "Submit synthetic mutation" }).waitFor();
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => { document.documentElement.dataset.printFormat = "thermal"; });
    const paperRule = await page.evaluate(() => {
      const pages = [];
      function walk(rules) { for (const rule of rules) { if (rule.type === CSSRule.PAGE_RULE) pages.push({ name: rule.selectorText, size: rule.style.getPropertyValue("size") }); if (rule.cssRules) walk(rule.cssRules); } }
      for (const sheet of document.styleSheets) walk(sheet.cssRules);
      return { page: getComputedStyle(document.querySelector("[data-document]")).page, sizes: pages.filter((rule) => rule.name === "restaurant-thermal").map((rule) => rule.size) };
    });
    assert.equal(paperRule.page, "restaurant-thermal", "DocumentFrame overrides the Restaurant thermal page");
    assert.ok(paperRule.sizes.some((size) => size.includes("80mm") && size.includes("297mm")), "Thermal page size was discarded by the browser");
    const dimensions = await page.locator("[data-document]").evaluate((node) => ({ width: node.getBoundingClientRect().width, scroll: node.scrollWidth, client: node.clientWidth }));
    assert.ok(dimensions.width <= 273, "Thermal surface exceeds 72mm");
    assert.ok(dimensions.scroll <= dimensions.client + 1, "Thermal content overflows horizontally");
    const receipt = await page.locator("[data-document]").textContent();
    for (const token of ["REPRINT COPY", "CANCELLED", "VOID", "Remaining balance", "SYNTHETIC-RR-100"]) assert.ok(receipt.includes(token));
    const receiptPdf = path.join(root, "synthetic-receipt-80mm.pdf");
    await page.pdf({ path: receiptPdf, preferCSSPageSize: true, printBackground: true });
    const receiptPages = thermalPdfPages(receiptPdf);
    await page.goto(url + "/?kind=kot");
    await page.getByText("KITCHEN COPY").waitFor();
    const kot = await page.locator("[data-document]").textContent();
    assert.ok(kot.includes("Extra sauce") && kot.includes("No onions"));
    assert.ok(!kot.includes("BANK TRANSFER") && !kot.includes("Remaining balance"));
    await page.evaluate(() => { document.documentElement.dataset.printFormat = "thermal"; });
    const kotDimensions = await page.locator("[data-document]").evaluate((node) => ({ width: node.getBoundingClientRect().width, scroll: node.scrollWidth, client: node.clientWidth }));
    assert.ok(kotDimensions.width <= 273 && kotDimensions.scroll <= kotDimensions.client + 1, "KOT thermal content overflows horizontally");
    const kotPdf = path.join(root, "synthetic-kot-80mm.pdf");
    await page.pdf({ path: kotPdf, preferCSSPageSize: true, printBackground: true });
    const kotPages = thermalPdfPages(kotPdf);
    assert.deepEqual(errors, [], "Browser runtime errors");
    console.log(JSON.stringify({ result: "PASS", scope: "isolated real POS/form/error/DocumentFrame UI with synthetic action transport, no provider auth or live server actions", doubleSubmitRequests, previousStatefulDoubleSubmitRequests: 2, posDoubleSubmitRequests: 1, posPendingCartLock: "PASS", posSuccessCartClear: "PASS", totalSyntheticRequests: requests, refreshDuringMutation: "PASS", refreshAfterSuccess: "PASS", backNavigation: "PASS", errorReset: "PASS", paperRule, receiptPages, kotPages, thermalDimensions: dimensions, kotDimensions, browserErrors: errors.length }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
