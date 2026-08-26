import { FlaskConical } from "lucide-react";

export function DemoDataNotice({ module }: { module: string }) {
  return <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><FlaskConical className="h-4 w-4 shrink-0" />{module} remains demo-backed in Phase 2A. Changes here are not persisted yet.</div>;
}
