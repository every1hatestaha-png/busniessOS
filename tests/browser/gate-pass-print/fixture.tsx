import React from "react";
import { createRoot } from "react-dom/client";
import { GatePassPrintBody, type GatePassPrintableData } from "../../../components/gate-passes/gate-pass-print-body";
import { GatePassReceivingPrintBody, type GatePassReceivingPrintData } from "../../../components/gate-passes/gate-pass-receiving-print-body";
import { PrintShortcutRouter } from "../../../components/documents/print-shortcut-router";
import "../../../app/globals.css";

const params = new URLSearchParams(location.search);
const paper = params.get("paper");
const documentType = params.get("document") === "receiving" ? "receiving" : "gate-pass";
if (paper === "thermal") document.documentElement.dataset.printFormat = "thermal";
const gp: GatePassPrintableData = {
  gatePassNumber: "GP-SYNTHETIC-2026-0100",
  status: "ISSUED",
  customer: {
    name: "Receiver at Synthetic Manufacturing Co.",
    companyName: "Synthetic Receiving Company (Print QA Only)",
    address: "Industrial Estate, Lahore — test data",
    phone: "000-0000000",
  },
  deliveryAddress: "Long industrial street and receiving warehouse location, Lahore — synthetic address only",
  notes: "Handle with care. Test fixture has no accounting effect, no real customer data and no invoicing.",
  items: Array.from({ length: 48 }, (_, index) => ({
    id: `gp-item-${index}`,
    productNameSnapshot: `Industrial machinery assembly component part ${index + 1} with a long descriptive name to force wrapping across multiple pages`,
    productSkuSnapshot: `SKU-SYNTHETIC-LONG-REFERENCE-${index + 1}`,
    dispatchedQuantity: "1.2500",
    productUnitSnapshot: index % 2 === 0 ? "PIECE" : "KG",
  })),
};
const receiving: GatePassReceivingPrintData = {
  gatePassNumber: gp.gatePassNumber,
  receivedAt: "12 Oct 2026, 15:01",
  interim: true,
  customer: { name: gp.customer.name, companyName: gp.customer.companyName, address: gp.customer.address },
  deliveryAddress: gp.deliveryAddress,
  reference: "SIGNED-SYNTHETIC-RECEIVING-001",
  recipient: "Synthetic customer receiving officer",
  notes: "Synthetic interim receiving only — no invoices, payment, stock or customer changes.",
  items: gp.items.map((item, index) => ({
    id: item.id,
    name: item.productNameSnapshot,
    sent: item.dispatchedQuantity,
    accepted: index === 0 ? "0.5000" : "1.0000",
    rejected: "0.2500",
    awaiting: index === 0 ? "0.5000" : "0",
    unit: item.productUnitSnapshot,
  })),
  totals: null, // Mixed PIECE and KG units must never be incorrectly aggregated.
};
const workspace = { name: "Synthetic GatePass Printer Company", address: "Test address", phone: "000-0000000" };
createRoot(document.getElementById("root")!).render(
  <main data-gate-pass-print-route={["DRAFT","CANCELLED"].includes(params.get("status")??"") ? "" : "/gate-passes/10000000-0000-4000-8000-000000000001/print"} className="mx-auto max-w-4xl space-y-4 p-5 print:m-0 print:max-w-none print:p-0">
    <PrintShortcutRouter/>
    <nav data-gp-synthetic-toolbar className="print:hidden">This toolbar must never be printed</nav>
    {documentType === "receiving"
      ? <GatePassReceivingPrintBody workspace={workspace} data={receiving} />
      : <GatePassPrintBody workspace={workspace} gp={gp} date="12/10/2026"
          recipient={gp.customer.companyName!} totalQuantity="—" totalUnit="Mixed units" isSingleUnit={false} />}
  </main>
);
