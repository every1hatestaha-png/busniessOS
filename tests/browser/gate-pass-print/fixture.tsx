import React from "react";
import { createRoot } from "react-dom/client";
import { GatePassPrintBody, type GatePassPrintableData } from "../../../components/gate-passes/gate-pass-print-body";
import "../../../app/globals.css";

const paper = new URLSearchParams(location.search).get("paper");
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
createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-4xl space-y-4 p-5 print:m-0 print:max-w-none print:p-0">
    <nav data-gp-synthetic-toolbar className="print:hidden">This toolbar must never be printed</nav>
    <GatePassPrintBody workspace={{ name: "Synthetic GatePass Printer Company", address: "Test address", phone: "000-0000000" }}
      gp={gp} date="12/10/2026" recipient={gp.customer.companyName!}
      totalQuantity="—" totalUnit="Mixed units" isSingleUnit={false} />
  </main>
);
