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
    for (const paper of ["a4", "thermal"]) {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${url}/?paper=${paper}`);
      await page.locator("[data-gate-pass-print] tbody tr").first().waitFor();
      assert.equal(await page.locator("[data-gate-pass-print] tbody tr").count(), 48);
      assert.equal(await page.locator("[data-gatepass-items] thead th").count(), 5);
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator("[data-gp-synthetic-toolbar]").evaluate((el) => getComputedStyle(el).display), "none");
      const skuDisplay = await page.locator("[data-gp-sku]").first().evaluate((el) => getComputedStyle(el).display);
      assert.equal(skuDisplay === "none", paper === "thermal", "SKU column print visibility is incorrect");
      const thermalTotalsDisplay = await page.locator("[data-gp-thermal-totals]").evaluate((el) => getComputedStyle(el).display);
      assert.equal(thermalTotalsDisplay === "none", paper === "a4", "Paper-specific totals are not isolated");
      const widths = await page.locator("[data-gate-pass-print]").evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      assert.ok(widths.scroll <= widths.client + 5, `${paper} clipped horizontal document: ${JSON.stringify(widths)}`);
      await page.screenshot({ path: path.join(output, `gate-pass-${paper}.png`), fullPage: true });
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
      const out = path.join(output, `gate-pass-${paper}.pdf`);
      fs.writeFileSync(out, pdf);
      const pages = boxes(pdf);
      assert.ok(pages.length >= 1, `${paper} had no PDF page boxes`);
      const expected = paper === "a4" ? [594, 597] : [225, 229];
      for (const p of pages) {
        assert.ok(p[2] - p[0] >= expected[0] && p[2] - p[0] <= expected[1], `${paper} printed wrong paper width: ${p.join(",")}`);
      }
      assert.equal(errors.length, 0, `${paper} browser errors: ${errors.join("; ")}`);
      console.log(`PASS ${paper}: ${pages.length} page(s), paper width ${(pages[0][2] - pages[0][0]).toFixed(1)}pt, 48 lines, clean print surface`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
