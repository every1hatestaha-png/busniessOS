export default function RestaurantLoading() {
  return (
    <div role="status" aria-label="Loading Restaurant workspace" className="mx-auto max-w-[1480px] space-y-5">
      <p className="text-sm text-muted-foreground">Loading Restaurant workspace…</p>
      <div aria-hidden="true" className="h-36 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
      <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />)}
      </div>
    </div>
  );
}
