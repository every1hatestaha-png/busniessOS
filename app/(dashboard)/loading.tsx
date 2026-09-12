export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] animate-pulse space-y-5" aria-label="Loading page">
      <div className="space-y-2">
        <div className="h-7 w-52 rounded bg-slate-200" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 rounded-lg border bg-white p-4"><div className="h-3 w-20 rounded bg-slate-100" /><div className="mt-4 h-6 w-28 rounded bg-slate-200" /></div>)}
      </div>
      <div className="h-72 rounded-lg border bg-white p-5"><div className="h-4 w-32 rounded bg-slate-200" /><div className="mt-5 space-y-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-9 rounded bg-slate-50" />)}</div></div>
    </div>
  );
}
