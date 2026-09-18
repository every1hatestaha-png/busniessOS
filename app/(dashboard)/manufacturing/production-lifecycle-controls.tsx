"use client";

import { useActionState } from "react";
import { CheckCircle2, PackageCheck } from "lucide-react";

import {
  approveProductionRunAction,
  initialManufacturingActionState,
  postProductionRunAction,
} from "@/app/(dashboard)/manufacturing/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Run = { id: string; runNumber: string; status: string; plannedOutput: number; actualOutput: number | null; wastageQuantity: number };

export function ProductionLifecycleControls({ runs, canManage }: { runs: Run[]; canManage: boolean }) {
  const actionable = runs.filter((run) => run.status === "DRAFT" || run.status === "APPROVED");
  if (!actionable.length) return null;
  return (
    <div className="rounded-md border">
      <div className="border-b px-4 py-3"><p className="text-sm font-semibold">Production approvals & posting</p><p className="text-xs text-muted-foreground">Posting consumes raw stock and creates finished-goods stock atomically. It cannot be undone from this screen.</p></div>
      <div className="divide-y">{actionable.map((run) => <ProductionRunRow key={run.id} run={run} canManage={canManage} />)}</div>
    </div>
  );
}

function ProductionRunRow({ run, canManage }: { run: Run; canManage: boolean }) {
  const [approveState, approveAction, approvePending] = useActionState(approveProductionRunAction, initialManufacturingActionState);
  const [postState, postAction, postPending] = useActionState(postProductionRunAction, initialManufacturingActionState);
  return (
    <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] lg:items-center">
      <div>
        <div className="flex items-center gap-2"><span className="font-medium">{run.runNumber}</span><span className="rounded-full border px-2 py-0.5 text-[11px]">{run.status}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">Planned output: {run.plannedOutput.toLocaleString()}</p>
        <ActionMessage state={run.status === "DRAFT" ? approveState : postState} />
      </div>
      {canManage ? run.status === "DRAFT" ? (
        <form action={approveAction} className="flex justify-end"><input type="hidden" name="productionRunId" value={run.id} /><Button type="submit" size="sm" disabled={approvePending}><CheckCircle2 />{approvePending ? "Approving..." : "Approve run"}</Button></form>
      ) : (
        <form action={postAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="productionRunId" value={run.id} />
          <Input name="actualOutput" type="number" min="0.0001" step="0.0001" defaultValue={run.plannedOutput} aria-label="Actual output" required />
          <Input name="wastageQuantity" type="number" min={0} step="0.0001" defaultValue={0} aria-label="Wastage quantity" required />
          <Button type="submit" size="sm" disabled={postPending}><PackageCheck />{postPending ? "Posting..." : "Post production"}</Button>
        </form>
      ) : <p className="text-right text-xs text-muted-foreground">Manager access required for production approval/posting.</p>}
    </div>
  );
}

function ActionMessage({ state }: { state: { status: "idle" | "success" | "error"; message: string } }) { if (!state.message) return null; return <p className={state.status === "error" ? "mt-1 text-xs text-destructive" : "mt-1 text-xs text-emerald-700"}>{state.message}</p>; }
