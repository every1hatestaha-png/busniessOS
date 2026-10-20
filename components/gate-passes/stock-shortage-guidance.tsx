import Link from "next/link";

export type GatePassStockShortage = {
  name: string;
  productId: string | null;
  required: string;
  available: string;
  shortfall: string;
};

export function GatePassStockShortageGuidance({
  shortages,
  isV2Draft,
  canReviewInventory,
  canCreateReplacement,
  gatePassId,
}: {
  shortages: GatePassStockShortage[];
  isV2Draft: boolean;
  canReviewInventory: boolean;
  canCreateReplacement: boolean;
  gatePassId: string;
}) {
  if (shortages.length === 0) return null;

  return <div role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
    <p className="font-semibold">
      Insufficient {isV2Draft ? "V2 issue" : "dispatch"} stock — {isV2Draft ? "issuance" : "shipment"} cannot proceed yet.
    </p>
    <p className="mt-1">The quantities below reflect the current inventory read, not a reservation. The server rechecks stock when the action is submitted. No inventory was changed by this check.</p>
    <ul className="mt-2 list-disc space-y-2 pl-5">
      {shortages.map((item, i) => <li key={item.productId ?? `${item.name}:${i}`}>
        <span className="font-medium">{item.name}</span>: required {item.required}, available {item.available}, short {item.shortfall}.
        {canReviewInventory && item.productId &&
          <> <Link href={`/inventory/${encodeURIComponent(item.productId)}`} className="font-medium underline underline-offset-2">Review stock and movements</Link></>}
        {!item.productId && <> Product record unavailable; correct the catalog or contact the workspace administrator before proceeding.</>}
      </li>)}
    </ul>
    <p className="mt-2">If the goods physically exist but are missing from the system, reconcile the genuine inventory receipt or documented adjustment in Inventory before attempting dispatch. Do not enter stock that does not physically exist.</p>
    {canCreateReplacement && <>
      <p className="mt-2">For a smaller genuine shipment, create a separate replacement draft and review its quantities. The original issued Gate Pass stays unchanged until you cancel it separately; copying does not move stock.</p>
      <Link href={`/gate-passes/new?copyFrom=${encodeURIComponent(gatePassId)}`} className="mt-2 inline-flex rounded-md border border-amber-700 px-3 py-2 font-semibold">
        Prepare replacement draft
      </Link>
    </>}
  </div>;
}
