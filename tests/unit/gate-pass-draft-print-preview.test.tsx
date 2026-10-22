import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/documents/workspace-identity", () => ({
  WorkspaceIdentity: ({workspace}: {workspace: {name: string}}) => createElement("div", {}, workspace.name),
}));

import { GatePassPrintBody } from "@/components/gate-passes/gate-pass-print-body";

const basic = {
  workspace: { name: "Synthetic Factory" },
  gp: {
    gatePassNumber: "GP-TEST-001",
    status: "DRAFT",
    customer: {name: "Test customer",companyName:null,address:null,phone:null},
    deliveryAddress:null,
    notes:null,
    items:[{id:"test-item",productNameSnapshot:"Test component",productSkuSnapshot:"ABC",dispatchedQuantity:"2",productUnitSnapshot:"PIECE"}],
  },
  date:"22/10/2026",
  recipient:"Test customer",
  totalQuantity:"2",
  totalUnit:"PIECE",
  isSingleUnit:true,
};

describe("gate pass print availability and safety", () => {
  it("prints a prominent persistent draft warning, without dispatch signatures or financial mutations", () => {
    const html = renderToStaticMarkup(createElement(GatePassPrintBody,basic));
    expect(html).toContain("DRAFT COPY — NOT VALID FOR DISPATCH OR CUSTOMER DELIVERY");
    expect(html).toContain("UNISSUED DRAFT. Stock has not been deducted.");
    expect(html).toContain("data-gate-pass-draft-warning");
    expect(html).not.toContain("data-document-signatures");
    expect(html).not.toContain("Receiver signature / stamp");
    expect(html).toContain("GP-TEST-001");
  });

  it("keeps the issued gate pass printable with its signature lines and without draft markings", () => {
    const html = renderToStaticMarkup(createElement(GatePassPrintBody, {
      ...basic, gp: {...basic.gp,status:"ISSUED"},
    }));
    expect(html).toContain("data-document-signatures");
    expect(html).toContain("Receiver signature / stamp");
    expect(html).not.toContain("DRAFT COPY");
    expect(html).not.toContain("UNISSUED DRAFT");
  });

  it("exposes draft previews but never permits a cancelled document to print", () => {
    const route = readFileSync("app/(dashboard)/gate-passes/[id]/print/page.tsx","utf8");
    const detail = readFileSync("app/(dashboard)/gate-passes/[id]/page.tsx","utf8");
    const list = readFileSync("app/(dashboard)/gate-passes/page.tsx","utf8");
    expect(route).toContain('if (!gp || gp.status === "CANCELLED") notFound()');
    expect(route).toContain('Print Draft A4');
    expect(route).toContain('Print Draft 80mm');
    expect(detail).toContain('>Print Draft Preview</Link>');
    expect(detail).toContain('>Print Gate Pass</Link>');
    expect(list).toContain('row.status !== "CANCELLED"');
    expect(list).toContain('Preview draft');
  });
});