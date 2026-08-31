export default function DashboardLoading() {
  return (
    <div className="space-y-4" aria-label="Loading page">
      <div className="h-24 animate-pulse rounded-xl bg-neutral-100" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-neutral-100" />)}
      </div>
      <div className="h-96 animate-pulse rounded-xl bg-neutral-100" />
    </div>
  );
}
