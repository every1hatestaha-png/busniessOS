export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6" aria-label="Loading page">
      <div className="h-12 w-80 animate-pulse rounded-md bg-slate-200/70" />
      <div className="grid gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-md border bg-white" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,0.8fr)]">
        <div className="h-80 animate-pulse rounded-md border bg-white" />
        <div className="h-80 animate-pulse rounded-md border bg-white" />
      </div>
    </div>
  );
}
