"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { rowsToCsv } from "@/lib/csv";

function safeFilename(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
}

export function ExportCsvButton({ title }: { title: string }) {
  function exportCsv() {
    const tables = Array.from(document.querySelectorAll<HTMLElement>("[data-print-surface] table"));
    if (!tables.length) return;

    const rows: string[][] = [];
    tables.forEach((table, tableIndex) => {
      if (tableIndex > 0) rows.push([]);
      for (const row of Array.from(table.querySelectorAll("tr"))) {
        const cells = Array.from(row.querySelectorAll<HTMLElement>("th,td")).map((cell) => cell.innerText.trim());
        if (cells.length) rows.push(cells);
      }
    });

    const blob = new Blob(["\uFEFF", rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(title)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return <Button type="button" variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" />CSV</Button>;
}
