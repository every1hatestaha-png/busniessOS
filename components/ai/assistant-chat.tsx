"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Database, MessageSquare, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const suggestions = [
  "Aj ki total sales kitni hain?",
  "Sab se zyada outstanding customers kaun hain?",
  "Low stock products batao.",
  "Current receivables aur payables kitne hain?",
  "Is month ka profit/loss summary batao.",
];

type AssistantMode = "groq" | "live-fallback";

type AssistantResponse = {
  message: string;
  mode?: AssistantMode;
  model?: string | null;
  toolsUsed?: string[];
};

type Message = {
  id: number;
  role: "assistant" | "user";
  content: string;
  response?: AssistantResponse;
};

export function AssistantChat() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content: "Assalam-o-alaikum! Main aapke current MunshiOS workspace ka live data dekh kar sales, inventory, khata, receivables, payables aur reports ke sawal answer karta hoon. Main khud se koi financial record change nahi karta.",
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const nextMessageId = useRef(2);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const latestMode = [...messages].reverse().find((message) => message.role === "assistant" && message.response?.mode)?.response?.mode;

  async function submit(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || busy) return;

    const history = messages
      .filter((message) => message.id !== 1)
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.content }));
    const userId = nextMessageId.current;
    nextMessageId.current += 2;
    setInput("");
    setBusy(true);
    setMessages((current) => [...current, { id: userId, role: "user", content: cleanQuestion }]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion, history }),
      });
      const payload = await response.json().catch(() => null) as { data?: AssistantResponse; error?: { message?: string } } | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message || "Assistant request failed.");
      }
      setMessages((current) => [
        ...current,
        { id: userId + 1, role: "assistant", content: payload.data!.message, response: payload.data },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: userId + 1,
          role: "assistant",
          content: "Live assistant abhi response nahi de saka. Koi business record change nahi hua. Dobara try karein.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(input);
  }

  return (
    <Card className="flex min-h-0 flex-1 overflow-hidden border-neutral-200 bg-white shadow-sm">
      <CardHeader className="border-b bg-neutral-50/70 pb-4">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Sparkles className="size-4" />
          </span>
          MunshiOS Assistant
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
            <Database className="size-3" />
            {latestMode === "groq" ? "Groq + live data" : latestMode === "live-fallback" ? "Live data" : "Live workspace"}
          </span>
        </div>
        <p className="pt-2 text-xs text-neutral-500">Read-only by design: answers are tenant-scoped and financial records are never changed from chat.</p>
        <div className="flex gap-2 overflow-x-auto pt-3 pb-1">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void submit(suggestion)}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageSquare className="size-3" />
              {suggestion}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.map((message) => (
            <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex gap-3"}>
              {message.role === "assistant" && (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <Sparkles className="size-4" />
                </span>
              )}
              <div className="max-w-[88%] space-y-1.5 sm:max-w-[78%]">
                <div className={message.role === "user" ? "whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-neutral-900 px-4 py-3 text-sm text-white" : "whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-neutral-100 px-4 py-3 text-sm leading-6 text-neutral-800"}>
                  {message.content}
                </div>
                {message.role === "assistant" && message.response?.mode === "live-fallback" && (
                  <p className="pl-1 text-[10px] text-neutral-400">Answered from verified live MunshiOS data. Groq reasoning is optional.</p>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="pl-11 text-sm text-neutral-400">Checking live business data...</p>}
          <div ref={endRef} />
        </div>
      </CardContent>

      <CardFooter className="border-t bg-white p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-3xl gap-2">
          <Input value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} placeholder="Apne live business ke baare mein poochain..." className="h-10 flex-1" aria-label="Message the business assistant" />
          <Button type="submit" size="icon-lg" disabled={busy || !input.trim()} aria-label="Send message"><Send /></Button>
        </form>
      </CardFooter>
    </Card>
  );
}
