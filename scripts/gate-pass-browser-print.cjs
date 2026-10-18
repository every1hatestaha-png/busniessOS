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
    const pathname = new URL(req.url, "http://localhost").pathname;
    // Only real fixture screens/documents get SPA fallback. A wrongly generated
    // /gate-passes/new/print remains a real HTTP404, making this regression fail.
    const fixtureRoute = /^\/gate-passes\/(?:new|pending-invoices|in-transit|[0-9a-f-]{36}(?:\/print)?)\/?$/.test(pathname);
    const relative = fixtureRoute ? "./index.html" : "." + pathname;
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
    browser = await chromium.launch({ headless: true, channel: process.env.GATEPASS_BROWSER_CHANNEL || undefined });
    const url = `http://127.0.0.1:${server.address().port}`;
    const id="10000000-0000-4000-8000-000000000001";
    for (const scenario of [
      ...["new","pending-invoices","in-transit"].map(segment=>({path:`/gate-passes/${segment}`,status:"ISSUED",navigate:false})),
      ...["DRAFT","CANCELLED","ISSUED"].map(status=>({path:`/gate-passes/${id}`,status,navigate:status==="ISSUED"})),
    ]) {
      const page=await browser.newPage({viewport:{width:390,height:844}});
      const failures=[];
      page.on("pageerror",error=>failures.push(error.message));
      page.on("response",response=>{if(response.status()===404)failures.push(`HTTP404 ${new URL(response.url()).pathname}`);});
      await page.goto(`${url}${scenario.path}?status=${scenario.status}`);
      await page.locator("[data-gate-pass-print] tbody tr").first().waitFor();
      const dispatch=()=>page.evaluate(async()=>{
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        window.dispatchEvent(new KeyboardEvent("keydown",{key:"p",ctrlKey:true,bubbles:true,cancelable:true}));
      });
      if (scenario.navigate) await Promise.all([page.waitForURL(u=>u.pathname===`/gate-passes/${id}/print`),dispatch()]);
      else {await dispatch();assert.equal(new URL(page.url()).pathname,scenario.path);}
      assert.deepEqual(failures,[]);
      console.log(`PASS Ctrl+P ${scenario.path}/${scenario.status}: ${scenario.navigate?"issued print route":"no invalid navigation"}`);
      await page.close();
    }
    for (const width of [390, 1280]) {
      for (const scenario of [
        {status:"ISSUED",billing:"approved",total:"145.61",final:false},
        {status:"PARTIALLY_ACCEPTED",billing:"blocked",total:"116.49",final:false},
        {status:"PARTIALLY_ACCEPTED",billing:"approved",total:"116.49",final:true},
      ]) {
        const page=await browser.newPage({viewport:{width,height:844}});
        const errors=[];page.on("pageerror",error=>errors.push(error.message));
        await page.goto(`${url}/?document=invoice-preparation&status=${scenario.status}&billing=${scenario.billing}`);
        await page.getByRole("heading",{name:"Create Invoice from Gate Pass"}).waitFor();
        const button=page.getByRole("button",{name:"Create Final Invoice"});
        if(scenario.final)assert.equal(await button.isDisabled(),true,"Tax must be explicitly selected");
        else assert.equal(await button.count(),0,"Preparation cannot offer final issuance");
        await page.getByLabel("Synthetic component unit price").fill("12.34");
        await page.getByLabel("Synthetic component tax percent").fill("18");
        await page.getByText(`PKR ${scenario.total}`,{exact:true}).waitFor();
        if(scenario.final){
          await button.click();assert.equal(await page.evaluate(()=>window.__gpInvoiceCalls),0,"Acknowledgement cannot be bypassed");
          await page.getByRole("checkbox").check();await button.click();
          assert.equal(await page.getByRole("button",{name:"Creating invoice…"}).isDisabled(),true);
          await page.getByRole("button",{name:"Creating invoice…"}).evaluate(el=>el.click());
          await page.getByRole("alert").waitFor();
          assert.equal(await page.evaluate(()=>window.__gpInvoiceCalls),1,"Repeated click while pending cannot submit twice");
        } else {
          await page.getByLabel("Synthetic component unit price").press("Enter");
          assert.equal(await page.evaluate(()=>window.__gpInvoiceCalls),0,"Preparation must not invoke a mutation");
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Page overflow");
        assert.deepEqual(errors,[]);
        await page.screenshot({path:path.join(output,`invoice-${scenario.status}-${scenario.billing}-${width}.png`),fullPage:true});
        console.log(`PASS invoice preparation ${scenario.status}/${scenario.billing}/${width}: exact preview, guarded manual issuance, no page overflow/errors`);
        await page.close();
      }
    }
    for (const width of [390,1280]) {
      for (const role of ["OWNER","ADMIN"]) {
        const page=await browser.newPage({viewport:{width,height:844}});
        const errors=[];page.on("pageerror",error=>errors.push(error.message));
        await page.goto(`${url}/?document=owner-declaration&status=DRAFT&role=${role}`);
        const button=page.getByRole("button",{name:"Issue Gate Pass",exact:true});
        await button.waitFor();assert.equal(await button.isDisabled(),true);
        assert.equal(await page.evaluate(()=>window.__gpIssueCalls),0);
        if (role === "OWNER") {
          await page.getByLabel("Customer terms / tax-position reference").fill("SYNTHETIC-OWNER-BASIS");
          await page.getByLabel("Why no invoice is required before acceptance").fill("Synthetic browser-only factual basis and delivery terms; not an actual approval or legal clearance.");
          assert.equal(await button.isDisabled(),true,"A textual basis alone cannot imply consent");
          const boxes=page.getByRole("checkbox");assert.equal(await boxes.count(),3);
          for (const box of await boxes.all()) {assert.equal(await box.isChecked(),false);await box.check();}
          assert.equal(await button.isDisabled(),false);await button.click();
          assert.equal(await page.getByRole("button",{name:"Issuing…"}).isDisabled(),true);
          await page.getByRole("button",{name:"Issuing…"}).evaluate(el=>el.click());
          await page.getByRole("alert").waitFor();assert.equal(await page.evaluate(()=>window.__gpIssueCalls),1);
          assert.equal(await button.isDisabled(),true,"A reset after an error must clear consent readiness too");
        } else assert.equal(await page.getByLabel("Why no invoice is required before acceptance").count(),0);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        assert.deepEqual(errors,[]);
        await page.screenshot({path:path.join(output,`owner-declaration-${role}-${width}.png`),fullPage:true});
        console.log(`PASS owner declaration ${role}/${width}: explicit consent, role-scoped UI, single pending submission`);
        await page.close();
      }
    }
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
