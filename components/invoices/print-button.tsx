"use client";

import { Printer, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({
  label = "Print",
  disabled = false,
  format = "default",
}: {
  label?: string;
  disabled?: boolean;
  format?: "default" | "thermal";
}) {
  function print() {
    if (format === "thermal") document.documentElement.dataset.printFormat = "thermal";
    const cleanup = () => {
      if (format === "thermal") delete document.documentElement.dataset.printFormat;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  const Icon = format === "thermal" ? ReceiptText : Printer;
  return <Button type="button" variant="outline" disabled={disabled} onClick={print}><Icon className="h-4 w-4" />{label}</Button>;
}
