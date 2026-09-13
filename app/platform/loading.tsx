export default function PlatformLoading() {
  return (
    <main className="min-h-dvh bg-[#fafaf8] px-5 py-8 text-slate-950" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="h-20 animate-pulse rounded-xl border bg-white" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border bg-white" />)}
        </div>
        <div className="h-80 animate-pulse rounded-xl border bg-white" />
        <p className="sr-only">Loading platform administration...</p>
      </div>
    </main>
  );
}
