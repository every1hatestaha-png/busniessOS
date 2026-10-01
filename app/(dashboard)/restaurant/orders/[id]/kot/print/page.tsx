import { notFound } from "next/navigation";

import { PrintOnLoad } from "@/components/documents/print-on-load";
import { WorkspaceIdentity } from "@/components/documents/workspace-identity";
import { requireWorkspace } from "@/lib/server/auth";
import { IndustryDomainError } from "@/lib/server/industry-modules";
import { getRestaurantOrder } from "@/lib/server/restaurant-workspace";

const KITCHEN_STATUSES = new Set(["CONFIRMED", "PREPARING", "READY", "COMPLETED"]);

function modifierText(value: unknown) {
  if (!Array.isArray(value)) return null;
  const labels = value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const label = record.name ?? record.label ?? record.value;
        return typeof label === "string" ? label.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
  return labels.length ? labels.join(", ") : null;
}

export default async function RestaurantKotPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requireWorkspace();

  let order: Awaited<ReturnType<typeof getRestaurantOrder>>;
  try {
    order = await getRestaurantOrder(workspaceId, id);
  } catch (error) {
    if (error instanceof IndustryDomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  if (!KITCHEN_STATUSES.has(order.status)) notFound();

  const timezone = workspace.timezone || "Asia/Karachi";
  const timestamp = new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(order.createdAt);

  return (
    <>
      <article data-document className="mx-auto w-full max-w-[72mm] bg-white text-black">
        <header className="border-b-2 border-black p-3 text-center">
          <WorkspaceIdentity
            workspace={workspace}
            eyebrow="Kitchen order ticket"
            nameClassName="text-base font-black"
            detailsClassName="hidden"
          />
          <p className="mt-3 font-mono text-xl font-black">{order.orderNumber}</p>
          <p className="text-[10px]">{timestamp}</p>
          <p className="mt-1 text-sm font-black">
            {order.fulfillmentType.replaceAll("_", " ")}
            {order.tableName ? ` · ${order.tableName}` : ""}
          </p>
          <p className="text-[10px]">{order.source} · {order.status}</p>
        </header>

        <section className="p-2">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-[10px]">
                <th className="w-10 py-1 text-left">QTY</th>
                <th className="py-1 text-left">ITEM</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const modifiers = modifierText(item.modifiers);
                return (
                  <tr key={item.id} className="border-b border-dashed border-black align-top">
                    <td className="py-2 pr-2 text-base font-black tabular-nums">{item.quantity}</td>
                    <td className="py-2 text-sm font-black">
                      {item.itemName}
                      {modifiers ? <span className="mt-1 block text-[10px] font-semibold">MOD: {modifiers}</span> : null}
                      {item.notes ? <span className="mt-1 block border-l-2 border-black pl-1 text-[10px] font-semibold">NOTE: {item.notes}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {order.notes ? (
          <section className="border-t-2 border-black p-2 text-xs font-bold">
            ORDER NOTE: {order.notes}
          </section>
        ) : null}

        {(order.customerName || order.customerPhone) ? (
          <section className="border-t border-dashed border-black p-2 text-[9px]">
            {order.customerName ? <p>{order.customerName}</p> : null}
            {order.customerPhone ? <p>{order.customerPhone}</p> : null}
          </section>
        ) : null}

        <footer className="border-t-2 border-black p-2 text-center text-[9px] font-semibold">
          Kitchen preparation ticket · no financial values
        </footer>
      </article>
      <PrintOnLoad format="thermal" />
    </>
  );
}
