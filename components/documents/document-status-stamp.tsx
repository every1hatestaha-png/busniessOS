export function DocumentStatusStamp({ status, reason }: { status: string; reason?: string | null }) {
  return (
    <section data-document-section data-status-stamp aria-label={`Document status: ${status}`} className="my-5 border-y-4 border-neutral-950 px-3 py-2 text-center">
      <p className="text-xl font-black uppercase tracking-[0.22em]">{status}</p>
      {reason && <p className="mt-1 text-xs font-medium normal-case tracking-normal">Reason: {reason}</p>}
    </section>
  );
}
