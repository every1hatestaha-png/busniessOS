"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";

import {
  type FbrProductMappingState,
  verifyFbrProductMappingAction,
} from "@/app/(dashboard)/inventory/actions";
import { Button } from "@/components/ui/button";
import type { ProductDTO } from "@/lib/server/products";

const initialState: FbrProductMappingState = {};

function dateLabel(value: string | null) {
  if (!value) return "Not verified";
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium" }).format(new Date(value));
}

export function FbrProductMappingCard({
  product,
  canManage,
}: {
  product: ProductDTO;
  canManage: boolean;
}) {
  const verify = verifyFbrProductMappingAction.bind(null, product.id);
  const [state, action, pending] = useActionState(verify, initialState);
  const verified = Boolean(
    product.fbrReferenceVerifiedAt
    && product.fbrTransactionTypeDesc
    && product.fbrRateDesc
    && product.fbrUomId,
  );
  const compoundRate = verified
    && product.fbrRateValue !== null
    && !new RegExp("^\\d+(?:\\.\\d+)?%$").test(product.fbrRateDesc.trim());

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b bg-slate-50/70 p-4">
        <div className="flex gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><ShieldCheck className="size-4" /></div>
          <div>
            <h2 className="text-sm font-semibold">FBR tax mapping</h2>
            <p className="mt-0.5 text-xs text-neutral-500">Server-verified reference metadata.</p>
          </div>
        </div>
        <span className={"rounded-full px-2 py-1 text-[10px] font-semibold " + (verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
          {verified ? "Verified" : "Not verified"}
        </span>
      </div>
      <div className="space-y-4 p-4 text-xs">
        <dl className="grid grid-cols-2 gap-3">
          <div><dt className="text-neutral-500">HS code</dt><dd className="mt-1 font-medium">{product.fbrHsCode || "—"}</dd></div>
          <div><dt className="text-neutral-500">UOM</dt><dd className="mt-1 font-medium">{product.fbrUom || "—"}{product.fbrUomId ? ` (#${product.fbrUomId})` : ""}</dd></div>
          <div className="col-span-2"><dt className="text-neutral-500">Sale type</dt><dd className="mt-1 font-medium">{product.fbrTransactionTypeDesc || (product.fbrTransactionTypeId ? `ID ${product.fbrTransactionTypeId} · pending verification` : "—")}</dd></div>
          <div><dt className="text-neutral-500">Rate</dt><dd className="mt-1 font-medium">{product.fbrRateDesc || (product.fbrRateId ? `ID ${product.fbrRateId}` : "—")}</dd></div>
          <div><dt className="text-neutral-500">Effective date</dt><dd className="mt-1 font-medium">{dateLabel(product.fbrReferenceVerifiedForDate)}</dd></div>
          <div className="col-span-2"><dt className="text-neutral-500">Seller province reference</dt><dd className="mt-1 font-medium">{product.fbrReferenceProvinceDesc || "—"}{product.fbrReferenceProvinceCode ? ` (#${product.fbrReferenceProvinceCode})` : ""}</dd></div>
        </dl>

        {compoundRate && (
          <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>This FBR rate uses a compound formula. It is reference-verified but remains blocked from MunshiOS production submission until that calculation is implemented and tested.</p>
          </div>
        )}
        {verified && !compoundRate && (
          <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <p>Transaction type, selected rate and UOM exist in the current FBR reference data. HS-code/UOM compatibility remains a separate production gate.</p>
          </div>
        )}

        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"} className={"rounded-lg border p-3 " + (state.status === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
            {state.message}
          </p>
        )}

        {canManage && (
          <form action={action}>
            <Button type="submit" size="sm" variant="outline" className="w-full" disabled={pending}>
              <RefreshCw className={"size-4 " + (pending ? "animate-spin" : "")} />
              {pending ? "Checking FBR references..." : "Verify with FBR sandbox references"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
