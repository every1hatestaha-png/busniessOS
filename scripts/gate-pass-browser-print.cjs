/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const output = path.resolve(__dirname, "../.tmp-gatepass-browser-print");
const boxes = (pdf) =>
  [...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[([\d.\s]+)\]/g)]
    .map((match) => match[1].trim().split(/\s+/).map(Number));

async function main() {
  const server = http.createServer((req, res) => {
    const relative = "." + new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(output, relative);
    const target = file === output ? path.join(output, "index.html") : file;
    if (!target.startsWith(output + path.sep) || !fs.existsSync(target)) {
      res.writeHead(404); res.end(); return;
    }
    const ext = path.extname(target);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "text/html" });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const url = `http://127.0.0.1:${server.address().port}`;
    for (const documentType of ["gate-pass", "receiving"]) {
      for (const paper of ["a4", "thermal"]) {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${url}/?paper=${paper}&document=${documentType}`);
      await page.locator("[data-gate-pass-print] tbody tr").first().waitFor();
      assert.equal(await page.locator("[data-gate-pass-print] tbody tr").count(), 48);
      assert.equal(await page.locator("[data-gatepass-items] thead th").count(), documentType === "receiving" ? 6 : 5);
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator("[data-gp-synthetic-toolbar]").evaluate((el) => getComputedStyle(el).display), "none");
      if (documentType === "receiving") {
        assert.equal(await page.locator("[data-receiving-acknowledgement-print]").count(), 1);
        assert.equal(await page.getByText("INTERIM RECEIVING — NOT FINAL").count(), 1);
        assert.equal(await page.getByText("SIGNED-SYNTHETIC-RECEIVING-001").count(), 1);
        const thermalLines = page.locator("[data-receiving-thermal-line]");
        assert.equal(await thermalLines.count(), 48, "Printable thermal receipt must include every item");
        const fullWidthVisible = await page.locator("[data-receiving-thermal]").evaluate((el) => getComputedStyle(el).display !== "none");
        assert.equal(fullWidthVisible, paper === "thermal", "Full-width receiving layout must display on thermal paper only");
        const a4Visible = await page.locator("[data-receiving-a4]").evaluate((el) => getComputedStyle(el).display !== "none");
        assert.equal(a4Visible, paper === "a4", "A4 receiving table should not crush thermal descriptions");
      } else {
        const skuDisplay = await page.locator("[data-gp-sku]").first().evaluate((el) => getComputedStyle(el).display);
        assert.equal(skuDisplay === "none", paper === "thermal", "SKU column print visibility is incorrect");
        const thermalTotalsDisplay = await page.locator("[data-gp-thermal-totals]").evaluate((el) => getComputedStyle(el).display);
        assert.equal(thermalTotalsDisplay === "none", paper === "a4", "Paper-specific totals are not isolated");
      }
      const widths = await page.locator("[data-gate-pass-print]").evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      assert.ok(widths.scroll <= widths.client + 5, `${documentType}/${paper} clipped horizontal document: ${JSON.stringify(widths)}`);
      await page.screenshot({ path: path.join(output, `${documentType}-${paper}.png`), fullPage: true });
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
      const out = path.join(output, `${documentType}-${paper}.pdf`);
      fs.writeFileSync(out, pdf);
      const pages = boxes(pdf);
      assert.ok(pages.length >= 1, `${documentType}/${paper} had no PDF page boxes`);
      const expected = paper === "a4" ? [594, 597] : [225, 229];
      for (const p of pages) {
        assert.ok(p[2] - p[0] >= expected[0] && p[2] - p[0] <= expected[1], `${documentType}/${paper} printed wrong paper width: ${p.join(",")}`);
      }
      assert.equal(errors.length, 0, `${documentType}/${paper} browser errors: ${errors.join("; ")}`);
      if (documentType === "receiving" && paper === "thermal") {
        assert.ok(pages.length <= 7, `80mm receiving used ${pages.length} sheets for 48 items; narrow-column regression`);
      }
      console.log(`PASS ${documentType}/${paper}: ${pages.length} page(s), paper width ${(pages[0][2] - pages[0][0]).toFixed(1)}pt, 48 lines, clean print surface`);
      await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
