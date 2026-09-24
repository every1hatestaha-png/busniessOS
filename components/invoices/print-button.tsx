"use client";

import { Printer, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { waitForPrintableAssets } from "@/lib/print-assets";

export function PrintButton({
  label = "Print",
  disabled = false,
  format = "default",
}: {
  label?: string;
  disabled?: boolean;
  format?: "default" | "thermal";
}) {
  async function print() {
    if (format === "thermal") document.documentElement.dataset.printFormat = "thermal";
    const cleanup = () => {
      if (format === "thermal") delete document.documentElement.dataset.printFormat;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    await waitForPrintableAssets();
    window.print();
  }

  const Icon = format === "thermal" ? ReceiptText : Printer;
  return <Button type="button" variant="outline" disabled={disabled} onClick={() => void print()}><Icon className="h-4 w-4" />{label}</Button>;
}
