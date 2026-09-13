export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6" aria-live="polite" aria-busy="true">
      <div className="space-y-2">
        <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl border bg-white" />)}
      </div>
      <div className="h-72 animate-pulse rounded-xl border bg-white" />
      <p className="sr-only">Loading MunshiOS data...</p>
    </div>
  );
}
