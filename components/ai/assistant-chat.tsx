"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, MessageSquare, Send, Sparkles, X } from "lucide-react";
import {
  AssistantResponse,
  businessAssistant,
} from "@/lib/business-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const suggestions = [
  "Aj ki total sales kitni hain?",
  "Kaun se customers ki payment overdue hai?",
  "150cc hub ka stock kitna hai?",
  "Ahmed Autos ka balance batao.",
  "Ahmed Autos ki Rs 50,000 payment record karo",
];

type Message = {
  id: number;
  role: "assistant" | "user";
  response: AssistantResponse;
  actionState?: "confirmed" | "cancelled";
};

export function AssistantChat() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      response: {
        message:
          "Assalam-o-alaikum! Sales, inventory aur khata ke demo data ke baare mein poochain. Main koi record khud se save nahi karta.",
      },
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const nextMessageId = useRef(2);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function submit(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || busy) return;

    const userId = nextMessageId.current;
    nextMessageId.current += 2;
    setInput("");
    setBusy(true);
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", response: { message: cleanQuestion } },
    ]);
    const response = await businessAssistant.ask(cleanQuestion);
    setMessages((current) => [
      ...current,
      { id: userId + 1, role: "assistant", response },
    ]);
    setBusy(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(input);
  }

  function resolveAction(id: number, actionState: "confirmed" | "cancelled") {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, actionState } : message,
      ),
    );
  }

  return (
    <Card className="flex min-h-0 flex-1 overflow-hidden border-neutral-200 bg-white shadow-sm">
      <CardHeader className="border-b bg-neutral-50/70 pb-4">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Sparkles className="size-4" />
          </span>
          BusinessOS Assistant
          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Demo mode</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pt-3 pb-1">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void submit(suggestion)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950"
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
              <div className="max-w-[88%] space-y-3 sm:max-w-[75%]">
                <div className={message.role === "user" ? "rounded-2xl rounded-tr-sm bg-neutral-900 px-4 py-3 text-sm text-white" : "rounded-2xl rounded-tl-sm bg-neutral-100 px-4 py-3 text-sm leading-6 text-neutral-800"}>
                  {message.response.message}
                </div>
                {message.response.proposedAction && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-semibold text-amber-950">Confirm record payment</p>
                      <span className="rounded-full border border-amber-300 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-800">Proposed</span>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-amber-950">
                      <dt className="text-amber-700">Customer</dt><dd className="text-right font-medium">{message.response.proposedAction.customerName}</dd>
                      <dt className="text-amber-700">Amount</dt><dd className="text-right font-medium">Rs {message.response.proposedAction.amount.toLocaleString("en-PK")}</dd>
                    </dl>
                    {!message.actionState ? (
                      <div className="mt-4 flex gap-2">
                        <Button size="sm" onClick={() => resolveAction(message.id, "confirmed")}><Check />Confirm demo</Button>
                        <Button size="sm" variant="outline" onClick={() => resolveAction(message.id, "cancelled")}><X />Cancel</Button>
                      </div>
                    ) : (
                      <p className="mt-4 border-t border-amber-200 pt-3 font-medium text-amber-900">
                        {message.actionState === "confirmed" ? "Demo confirmed. No payment was saved or recorded." : "Proposal cancelled. Nothing was changed."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="pl-11 text-sm text-neutral-400">Assistant is checking demo data...</p>}
          <div ref={endRef} />
        </div>
      </CardContent>

      <CardFooter className="border-t bg-white p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-3xl gap-2">
          <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Apne business ke baare mein poochain..." className="h-10 flex-1" aria-label="Message the business assistant" />
          <Button type="submit" size="icon-lg" disabled={busy || !input.trim()} aria-label="Send message"><Send /></Button>
        </form>
      </CardFooter>
    </Card>
  );
}
