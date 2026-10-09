import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);
vi.mock("@/components/marketing/motion", () => ({ MarketingMotion: () => null }));
import { MarketingHeader, MarketingFooter, CTA } from "@/components/marketing/site";
import { MunshiBuilder } from "@/app/get-your-munshi/munshi-builder";

describe("converged public marketing UI", () => {
  it("renders all five business choices before signup", () => {
    const markup = renderToStaticMarkup(createElement(MunshiBuilder));
    for (const choice of ["Retail Shop", "Restaurant / Cafe", "Wholesale / Distribution", "Manufacturing / Factory", "Services"]) {
      expect(markup).toContain(choice);
    }
    expect((markup.match(/type="button"/g) ?? []).length).toBe(5);
  });

  it("renders all desktop industries and a mobile link to the industries index", () => {
    const markup = renderToStaticMarkup(createElement(MarketingHeader));
    for (const industry of ["retail", "restaurant", "wholesale", "manufacturing", "services"]) {
      expect((markup.match(new RegExp(`href="/industries/${industry}"`, "g")) ?? []).length).toBe(1);
    }
    expect(markup).toContain("<details");
    expect(markup).toContain("<summary");
    const mobile = markup.slice(markup.indexOf('<nav aria-label="Mobile website navigation"'), markup.indexOf("</details>"));
    expect(mobile).toContain('href="/industries"');
    for (const path of ["/features", "/faq", "/sign-in", "/get-your-munshi"]) expect(markup).toContain(`href="${path}"`);
  });

  it("renders public legal links and all industry destinations in the footer", () => {
    const markup = renderToStaticMarkup(createElement(MarketingFooter));
    for (const path of ["/privacy", "/terms", "/features", "/faq", ...["retail", "restaurant", "wholesale", "manufacturing", "services"].map(industry => `/industries/${industry}`)]) {
      expect(markup).toContain(`href="${path}"`);
    }
  });

  it("keeps published pricing and routes the primary CTA through the builder", () => {
    const markup = renderToStaticMarkup(createElement(CTA));
    expect(markup).toContain("PKR 29,000 one-time implementation, then PKR 5,000 per month.");
    expect(markup).toContain('href="/get-your-munshi"');
    expect(markup).toContain('href="/sign-in"');
  });
});
