import { notFound } from "next/navigation";
import { DocumentFrame } from "@/components/documents/document-frame";
import { PrintButton } from "@/components/invoices/print-button";
import { RestaurantPrintBody } from "@/components/documents/restaurant-print-body";
import { RestaurantKitchenPrintBody } from "@/components/documents/restaurant-kitchen-print-body";
import { getRestaurantKitchenPrintDocument } from "@/lib/server/restaurant-kitchen-print";
import { requireWorkspace } from "@/lib/server/auth";
import { assertRestaurantStation } from "@/lib/server/restaurant-stations";
import { getRestaurantPrintDocument } from "@/lib/server/restaurant-print";
import "@/components/documents/restaurant-print.css";

export default async function RestaurantPrintPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; copy?: string }>;
}) {
  const { id } = await params;
  const options = await searchParams;
  const { workspaceId, workspace, role, user } = await requireWorkspace();
  const kitchen = options.kind === "kot";
  await assertRestaurantStation(
    { workspaceId, role, userId: user.id }, kitchen ? "KITCHEN" : "CASHIER",
  );
  if (kitchen) {
    // A Kitchen account must never load the cashier financial receipt model.
    const ticket = await getRestaurantKitchenPrintDocument(workspaceId, id);
    if (!ticket || !["CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"].includes(ticket.status)) notFound();
    return <>
      <div className="mb-4 flex gap-2 print:hidden"><PrintButton /><PrintButton label="Print 80mm" format="thermal" /></div>
      <div data-restaurant-print><DocumentFrame workspace={{ name: workspace.name }} title="Kitchen order ticket" number={ticket.orderNumber}>
        <RestaurantKitchenPrintBody document={ticket} reprint={options.copy === "1"} />
      </DocumentFrame></div>
    </>;
  }

  const document = await getRestaurantPrintDocument(workspaceId, id);
  if (!document) notFound();
  return <>
    <div className="mb-4 flex gap-2 print:hidden"><PrintButton /><PrintButton label="Print 80mm" format="thermal" /></div>
    <div data-restaurant-print><DocumentFrame workspace={workspace} title="Restaurant receipt" number={document.orderNumber}>
      <RestaurantPrintBody document={document} reprint={options.copy === "1"} />
    </DocumentFrame></div>
  </>;
}
