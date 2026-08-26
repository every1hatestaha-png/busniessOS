import { AssistantChat } from "@/components/ai/assistant-chat";

export default function AIPage() {
  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col gap-5">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Ask BusinessOS</p>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">Your business, in plain language</h1>
        <p className="mt-1 text-sm text-neutral-500 sm:text-base">Ask in English or Roman Urdu. Answers use demo data only.</p>
      </div>
      <AssistantChat />
    </div>
  );
}
