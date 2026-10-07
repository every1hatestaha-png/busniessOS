import { notFound } from "next/navigation";
import { DocumentFrame } from "@/components/documents/document-frame";
import { PrintButton } from "@/components/invoices/print-button";
import { RestaurantPrintBody } from "@/components/documents/restaurant-print-body";
import { requireWorkspace } from "@/lib/server/auth";
import { getRestaurantPrintDocument } from "@/lib/server/restaurant-print";
import "@/components/documents/restaurant-print.css";

export default async function RestaurantPrintPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; copy?: string }>;
}) {
  const { id } = await params;
  const options = await searchParams;
  const { workspaceId, workspace } = await requireWorkspace();
  const document = await getRestaurantPrintDocument(workspaceId, id);
  if (!document) notFound();
  const kitchen = options.kind === "kot";
  if (kitchen && !["CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"].includes(document.status)) notFound();
  return <>
    <div className="mb-4 flex gap-2 print:hidden"><PrintButton /><PrintButton label="Print 80mm" format="thermal" /></div>
    <div data-restaurant-print><DocumentFrame workspace={workspace} title={kitchen ? "Kitchen order ticket" : "Restaurant receipt"} number={document.orderNumber}>
      <RestaurantPrintBody document={document} kitchen={kitchen} reprint={options.copy === "1"} />
    </DocumentFrame></div>
  </>;
}
