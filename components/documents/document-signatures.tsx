export function DocumentSignatures({ slots }: { slots: Array<{ label: string; name?: string | null }> }) {
  return (
    <section data-document-signatures className="mt-12 grid gap-8 text-xs" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
      {slots.map((slot) => <div key={slot.label}><p className="font-semibold">{slot.label}</p>{slot.name && <p className="mt-1 text-neutral-600">{slot.name}</p>}<div className="mt-8 border-t border-neutral-500" /></div>)}
    </section>
  );
}
