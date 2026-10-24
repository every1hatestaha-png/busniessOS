"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Search, ShieldAlert, Trash2, X, ChevronRight, RefreshCw, Users, Database, SlidersHorizontal } from "lucide-react";

import {
  activateSubscriptionAction,
  deleteCustomerAccountAction,
  extendTrialAction,
  finalizeOwnerCleanupAction,
  grantGraceAction,
  previewCustomerAccountDeletionAction,
  suspendSubscriptionAction,
} from "@/app/platform/actions";
import { SecurePlatformForm } from "@/components/platform/secure-platform-form";

export type ManagedWorkspace = {
  id: string;
  name: string;
  city: string;
  email: string;
  plan: string;
  planCode: string;
  status: string;
  memberCount: number;
  accessEnd: string;
  requestedPlan: string | null;
  requestedAt: string | null;
};

type Preview = Awaited<ReturnType<typeof previewCustomerAccountDeletionAction>>;
type DeletionResult = Extract<Awaited<ReturnType<typeof deleteCustomerAccountAction>>, { ok: true }>;

// Exact one-time inventory approved by the owner on 2026-10-24.
// Later customer registrations never enter this batch automatically.
const OWNER_CLEANUP_TARGET_IDS = new Set([
  "2ec45fb5-47e0-411c-9982-75422c48fda2",
  "4492dbc1-bb03-4a8b-ad3d-2259b9848438",
  "a5c59974-78cc-41d9-a3b0-b959e2eccad1",
  "9b6ef094-a620-447e-86ae-1ac2c7b18f93",
  "e0251e80-2ff7-4ae5-9fb6-a5add30289e4",
  "b77b8aaa-0e02-46a0-ac57-ad3e08e932ef",
  "0e7568d8-c82c-49fe-a849-6b5ee491cd1c",
  "2aa1bfbd-0f96-45a9-a683-241913188a60",
  "87fc04e2-c57f-42f9-aeae-a3eacf68f180",
  "02def44e-e2d6-4eb9-8bc1-15ecfb90e046",
  "9e99d8fe-948d-4e61-acb9-28866e2a0eb4",
  "7e3a660a-6217-43f8-9959-a32cde278843",
  "1880e0f7-e474-446d-b24c-f7fb767e9bb7",
  "570a3818-a0f7-49e4-9670-344005ac706a",
  "3df23b1a-2562-480c-ad51-f9d075de57ca",
  "0a1f1bed-81dc-417f-b407-6b20da7eca2e",
  "10a3e62f-de08-4729-beac-97ea75408dfc",
  "318dc549-9943-4fc5-9dcf-fd2181fb23b4",
]);

const OWNER_CLEANUP_PROTECTED_IDS = new Set([
  "c15e0dd4-9d61-407b-a4dc-5490e2247151",
  "4bc313cf-2869-4d87-8f1e-22a147f18d2d",
  "a9e7ed7d-d3c2-434a-992e-972fb088273a",
]);

const filters = ["ALL", "ACTIVE", "TRIALING", "GRACE", "SUSPENDED", "EXPIRED", "UNASSIGNED"] as const;
const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  TRIALING: "bg-sky-50 text-sky-700 ring-sky-200",
  GRACE: "bg-amber-50 text-amber-700 ring-amber-200",
  SUSPENDED: "bg-rose-50 text-rose-700 ring-rose-200",
  EXPIRED: "bg-slate-100 text-slate-600 ring-slate-200",
  UNASSIGNED: "bg-violet-50 text-violet-700 ring-violet-200",
};
function statusStyle(value: string) {
  return statusStyles[value] ?? "bg-slate-100 text-slate-600 ring-slate-200";
}

export function WorkspaceAccountManager({ workspaces }: { workspaces: ManagedWorkspace[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [typedName, setTypedName] = useState("");
  const [typedPhrase, setTypedPhrase] = useState("");
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState<DeletionResult | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTyped, setBulkTyped] = useState("");
  const [bulkAcknowledged, setBulkAcknowledged] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkResults, setBulkResults] = useState<Array<{ name: string; detail: string }>>([]);
  const [bulkFinished, setBulkFinished] = useState(false);
  const cleanupCandidates = workspaces.filter((w) => OWNER_CLEANUP_TARGET_IDS.has(w.id));
  const unexpectedWorkspaces = workspaces.filter((w) =>
    !OWNER_CLEANUP_TARGET_IDS.has(w.id) && !OWNER_CLEANUP_PROTECTED_IDS.has(w.id)
  );
  const cleanupPhrase = cleanupCandidates.length
    ? `DELETE ${cleanupCandidates.length} WORKSPACES`
    : "FINALIZE AUTH CLEANUP";


  const displayed = useMemo(() => {
    const term = query.trim().toLowerCase();
    return workspaces.filter((w) => (filter === "ALL" || w.status === filter)
      && (!term || [w.name, w.city, w.email, w.id, w.plan].some((v) => v.toLowerCase().includes(term))));
  }, [workspaces, query, filter]);

  const current = workspaces.find((w) => w.id === selected) ?? null;
  const exactMatch = Boolean(current && typedName === current.name && typedPhrase === "DELETE PERMANENTLY" && ack);
  const pendingRequests = workspaces.filter((w) => w.requestedAt).length;

  function closePanel() {
    if (deleting) return;
    setSelected(null); setPreview(null); setError(""); setResult(null);
    setTypedName(""); setTypedPhrase(""); setAck(false);
  }

  async function startDelete(w: ManagedWorkspace) {
    setSelected(w.id);
    setError(""); setResult(null); setPreview(null);
    setTypedName(""); setTypedPhrase(""); setAck(false);
    setPreviewLoading(true);
    try {
      setPreview(await previewCustomerAccountDeletionAction(w.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the deletion preview. Verify recent MFA.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || !exactMatch || deleting) return;
    setDeleting(true);
    setError("");
    try {
      const data = new FormData();
      data.set("workspaceId", current.id);
      data.set("confirmName", typedName);
      data.set("deletePhrase", typedPhrase);
      data.set("acknowledgeIrreversible", "yes");
      const response = await deleteCustomerAccountAction(data);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deletion blocked. No completion was confirmed.");
    } finally {
      setDeleting(false);
    }
  }


  async function runOwnerCleanup() {
    if (bulkWorking || unexpectedWorkspaces.length !== 0 || !bulkAcknowledged || bulkTyped !== cleanupPhrase) return;
    setBulkError("");
    setBulkResults([]);
    setBulkFinished(false);
    setBulkWorking(true);
    try {
      for (const workspace of cleanupCandidates) {
        const preview = await previewCustomerAccountDeletionAction(workspace.id);
        if (preview.workspaceId !== workspace.id || preview.workspaceName !== workspace.name || !preview.permanentPurgeConfigured) {
          throw new Error(`Deletion preview changed for ${workspace.name}. Nothing further was deleted.`);
        }
        const data = new FormData();
        data.set("workspaceId", workspace.id);
        data.set("confirmName", preview.workspaceName);
        data.set("deletePhrase", "DELETE PERMANENTLY");
        data.set("acknowledgeIrreversible", "yes");
        const removed = await deleteCustomerAccountAction(data);
        if (!removed.ok) {
          throw new Error(`${workspace.name}: ${removed.error}`);
        }
        setBulkResults((results) => [...results, {
          name: workspace.name,
          detail: removed.identityCleanupComplete
            ? `${removed.removedRows} rows deleted, identity removed`
            : `${removed.removedRows} rows deleted, identity reconciliation pending`,
        }]);
      }

      const finalized = await finalizeOwnerCleanupAction();
      if (!finalized.ok) throw new Error(finalized.error);
      setBulkResults((results) => [...results, {
        name: "Supabase orphan identities",
        detail: `${finalized.deletedAuthUsers} removed. ${finalized.warnings.length ? finalized.warnings.join(" ") : "No provider errors."}`,
      }]);
      setBulkFinished(finalized.identityCleanupComplete);
      if (!finalized.identityCleanupComplete) {
        setBulkError("Workspace cleanup completed, but some identities remain. Retry finalization after verifying the provider.");
      }
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Cleanup stopped. Refresh the account list before retrying.");
    } finally {
      setBulkWorking(false);
    }
  }

  return (
    <section id="customer-accounts" className="scroll-mt-5 overflow-hidden rounded-2xl border border-[#e2e8e5] bg-white shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
      <div className="border-b border-slate-100 px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Directory</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Customer accounts</h2>
            <p className="mt-1 text-sm text-slate-500">Manage subscription access without opening customer accounting records.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold text-slate-600">{workspaces.length} accounts</span>
            <button type="button" disabled={bulkWorking || (cleanupCandidates.length === 0 && workspaces.length !== 3)} onClick={() => { setBulkOpen(true); setBulkTyped(""); setBulkAcknowledged(false); setBulkError(""); setBulkResults([]); setBulkFinished(false); }} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-40">Review approved cleanup ({cleanupCandidates.length})</button>
            {pendingRequests > 0 && <button onClick={() => { setQuery(""); setFilter("ALL"); }} type="button" className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 font-semibold text-sky-800">{pendingRequests} activation requests</button>}
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-slate-400" />
            <span className="sr-only">Search customer accounts</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search business, owner email or account ID"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white" />
          </label>
          <div className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
            <label htmlFor="admin-account-filter" className="sr-only">Status filter</label>
            <select id="admin-account-filter" value={filter} onChange={(e) => setFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
              {filters.map((value) => <option key={value} value={value}>{value === "ALL" ? "All statuses" : value === "TRIALING" ? "Trials" : value === "UNASSIGNED" ? "Unassigned" : value[0]+value.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-6 py-3.5">Business</th><th className="px-6 py-3.5">Plan</th><th className="px-6 py-3.5">Status</th><th className="px-6 py-3.5">Members</th><th className="px-6 py-3.5">Access until</th><th className="px-6 py-3.5 text-right">Management</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayed.map((w) => (
              <tr key={w.id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-6 py-4">
                  <p className="font-semibold text-slate-900">{w.name}</p>
                  <p className="mt-1 max-w-64 truncate text-xs text-slate-500" title={w.email}>{w.email} · {w.city}</p>
                  {w.requestedAt && <p className="mt-1 text-xs font-semibold text-sky-700">Activation requested · {w.requestedPlan ?? "plan"}</p>}
                </td>
                <td className="px-6 py-4 text-slate-700">{w.plan}</td>
                <td className="px-6 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusStyle(w.status)}`}>{w.status}</span></td>
                <td className="px-6 py-4"><span className="inline-flex items-center gap-1.5 text-slate-600"><Users aria-hidden="true" className="size-3.5" />{w.memberCount}</span></td>
                <td className="px-6 py-4 text-slate-600">{w.accessEnd}</td>
                <td className="px-6 py-4 text-right">
                  <button type="button" onClick={() => { setSelected(w.id); setPreview(null); setError(""); setResult(null); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800">
                    Manage <ChevronRight aria-hidden="true" className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {displayed.length === 0 && <tr><td colSpan={6} className="px-6 py-14 text-center text-sm text-slate-500">{workspaces.length ? "No accounts match your search or filter." : "No customer accounts yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">Showing {displayed.length} of {workspaces.length} accounts · Sensitive changes require a recent authenticator verification</div>

      {bulkOpen && (
        <div role="dialog" aria-modal="true" aria-label="Owner-approved customer cleanup" className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
          <section className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-rose-700">Permanent customer cleanup</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">{cleanupCandidates.length} approved workspaces</h3>
                <p className="mt-2 text-sm text-slate-600">Only the specific October 24 inventory is eligible. KHZR and both Arshad Sons businesses are permanently excluded. Owner MFA is checked again for each deletion.</p>
              </div>
              <button type="button" aria-label="Close bulk cleanup" disabled={bulkWorking} onClick={() => setBulkOpen(false)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><X className="size-5" /></button>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              {cleanupCandidates.map((workspace) => <div key={workspace.id} className="py-1 text-slate-700">{workspace.name} ({workspace.email})</div>)}
              {cleanupCandidates.length === 0 && <p className="text-slate-600">No approved workspace targets remain. Finalize orphaned Auth identities only.</p>}
            </div>
            {unexpectedWorkspaces.length > 0 && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">Unexpected account inventory detected. Cleanup is locked until these accounts are reviewed.</p>}
            <label className="block text-xs font-semibold text-slate-700">Type {cleanupPhrase}
              <input autoComplete="off" disabled={bulkWorking} value={bulkTyped} onChange={(event) => setBulkTyped(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" placeholder={cleanupPhrase} />
            </label>
            <label className="flex items-start gap-2 text-xs leading-5 text-slate-700">
              <input type="checkbox" checked={bulkAcknowledged} disabled={bulkWorking} onChange={(event) => setBulkAcknowledged(event.target.checked)} className="mt-1 accent-rose-700" />
              I approve permanent deletion of the listed businesses, transactions, and exclusive identities. This cannot be undone and provider backups have separate retention.
            </label>
            <button type="button" disabled={bulkWorking || bulkFinished || unexpectedWorkspaces.length > 0 || !bulkAcknowledged || bulkTyped !== cleanupPhrase}
              onClick={() => { void runOwnerCleanup(); }} className="w-full rounded-lg bg-rose-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
              {bulkWorking ? "Cleaning approved workspaces..." : bulkFinished ? "Cleanup completed" : "Permanently clean approved accounts"}
            </button>
            {bulkResults.length > 0 && <div role="status" className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-3 text-xs text-slate-700">
              {bulkResults.map((entry, i) => <p key={i} className="py-1"><span className="font-semibold">{entry.name}:</span> {entry.detail}</p>)}
            </div>}
            {bulkError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{bulkError} <Link href="/admin/security" className="font-semibold underline">Verify MFA</Link></p>}
            {bulkFinished && <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900">Refresh protected account inventory</button>}
          </section>
        </div>
      )}

      {current && (
        <div role="dialog" aria-modal="true" aria-label={`Manage ${current.name}`} className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 p-0 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) closePanel(); }}>
          <section className="h-full w-full max-w-xl overflow-y-auto bg-[#fafaf8] shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
              <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700">Account controls</p><h3 className="mt-1 break-words text-xl font-semibold text-slate-900">{current.name}</h3><p className="mt-1 break-all text-xs text-slate-500">{current.id}</p></div>
              <button type="button" aria-label="Close account panel" disabled={deleting} onClick={closePanel} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"><X className="size-5" /></button>
            </header>
            <div className="space-y-5 px-5 py-6 sm:px-7">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Plan</p><p className="mt-1 font-semibold text-slate-900">{current.plan}</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Members</p><p className="mt-1 font-semibold text-slate-900">{current.memberCount}</p></div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h4 className="text-sm font-semibold text-slate-900">Subscription & access</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">Changes take effect immediately. Reconfirm MFA from the security page if your session has expired.</p>
                <div className="mt-4 space-y-4">
                  <SecurePlatformForm action={activateSubscriptionAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="workspaceId" value={current.id} />
                    <label className="flex-1 text-xs font-semibold text-slate-700">Plan
                      <select name="planCode" defaultValue={["starter","business","pro"].includes(current.planCode) ? current.planCode : "starter"} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal"><option value="starter">Starter</option><option value="business">Business</option><option value="pro">Pro</option></select>
                    </label>
                    <label className="w-24 text-xs font-semibold text-slate-700">Days<input type="number" min="1" max="1095" name="days" defaultValue="30" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal" /></label>
                    <button type="submit" className="h-10 rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800">Activate</button>
                  </SecurePlatformForm>
                  <SecurePlatformForm action={extendTrialAction} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                    <input type="hidden" name="workspaceId" value={current.id} />
                    <label className="flex-1 text-xs font-semibold text-slate-700">Extend trial (days)<input type="number" min="1" max="365" name="days" defaultValue="7" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                    <button type="submit" className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50">Extend</button>
                  </SecurePlatformForm>
                  <SecurePlatformForm action={grantGraceAction} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                    <input type="hidden" name="workspaceId" value={current.id} />
                    <label className="flex-1 text-xs font-semibold text-slate-700">Grace period (days)<input type="number" min="1" max="90" name="days" defaultValue="7" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                    <button type="submit" className="h-10 rounded-lg border border-amber-300 bg-amber-50 px-4 text-xs font-semibold text-amber-900 hover:bg-amber-100">Grant grace</button>
                  </SecurePlatformForm>
                  <SecurePlatformForm action={suspendSubscriptionAction} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                    <input type="hidden" name="workspaceId" value={current.id} />
                    <label className="flex-1 text-xs font-semibold text-slate-700">Reason for suspension<input type="text" name="reason" required maxLength={240} placeholder="Required reason" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                    <button type="submit" className="h-10 rounded-lg border border-rose-300 bg-rose-50 px-4 text-xs font-semibold text-rose-800 hover:bg-rose-100">Suspend</button>
                  </SecurePlatformForm>
                </div>
              </div>

              <section className="rounded-xl border border-rose-200 bg-white p-5">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="mt-0.5 size-5 shrink-0 text-rose-700" aria-hidden="true" />
                  <div><h4 className="font-semibold text-rose-900">Danger zone</h4><p className="mt-1 text-xs leading-5 text-slate-600">Permanent deletion removes live tenant data. Backups and exported records have separate retention; database space may be reclaimed later.</p></div>
                </div>
                {!preview && !previewLoading && !result && <button type="button" onClick={() => { void startDelete(current); }} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"><Trash2 className="size-4" aria-hidden="true" /> Review permanent deletion</button>}
                {previewLoading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600"><RefreshCw className="size-4 animate-spin" /> Loading account impact...</p>}
                {preview && !result && (
                  <form onSubmit={(event) => { void confirmDelete(event); }} className="mt-5 space-y-4">
                    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold text-rose-900"><Database className="size-4" /> Records included in deletion</p>
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-700">
                        <span>Members: <b>{preview.members}</b></span><span>Customers: <b>{preview.customerCount}</b></span>
                        <span>Products: <b>{preview.productCount}</b></span><span>Invoices: <b>{preview.invoiceCount}</b></span>
                        <span>Sales orders: <b>{preview.orderCount}</b></span><span>Other linked tables: <b>Included</b></span>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-rose-900">This cannot be undone. Shared users in other businesses are preserved. External backups and snapshots are not purged.</p>
                      {!preview.permanentPurgeConfigured && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-950">Permanent deletion is locked until a Supabase server-only secret key is configured in the production environment. No account data will be deleted while this is missing.</p>}
                    </div>
                    <label className="block text-xs font-semibold text-slate-700">Type the exact business name
                      <input required autoComplete="off" value={typedName} onChange={(event) => setTypedName(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" placeholder={current.name} />
                    </label>
                    <label className="block text-xs font-semibold text-slate-700">Type DELETE PERMANENTLY
                      <input required autoComplete="off" value={typedPhrase} onChange={(event) => setTypedPhrase(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" placeholder="DELETE PERMANENTLY" />
                    </label>
                    <label className="flex items-start gap-2 text-xs leading-5 text-slate-700"><input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} className="mt-1 accent-rose-700" /><span>I understand that live account records and exclusive identities may be permanently deleted, and restore is not guaranteed.</span></label>
                    <button type="submit" disabled={!exactMatch || deleting || !preview.permanentPurgeConfigured} className="w-full rounded-lg bg-rose-700 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-40">{deleting ? "Permanently deleting..." : "Permanently delete this account"}</button>
                  </form>
                )}
                {result && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-semibold">Database deletion completed · {result.removedRows} tenant rows removed.</p>
                  <p className="mt-1">Identity cleanup: {result.identityCleanupComplete ? "Complete" : "Needs attention"}</p>
                  {result.warnings.map((w,i) => <p key={i} className="mt-1 text-xs">{w}</p>)}
                  <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white">Refresh account list</button>
                </div>}
                {error && <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">{error} {/MFA|authenticator/i.test(error) && <Link className="font-semibold underline" href="/admin/security">Verify MFA</Link>}</div>}
              </section>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
