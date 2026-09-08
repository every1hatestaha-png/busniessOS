"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print", disabled = false }: { label?: string; disabled?: boolean }) {
  return <Button type="button" variant="outline" disabled={disabled} onClick={() => window.print()}><Printer className="h-4 w-4" />{label}</Button>;
}
