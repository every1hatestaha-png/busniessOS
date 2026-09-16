"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Database, History, MessageSquare, Plus, Search, Send, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const suggestions = [
  "Aj ki total sales kitni hain?",
  "Sab se zyada outstanding customers kaun hain?",
  "Low stock products batao.",
  "Current receivables aur payables kitne hain?",
  "Is month ka profit/loss summary batao.",
];
const MAX_SAVED_CHATS = 30;

type AssistantMode = "groq" | "live-fallback";
type AssistantResponse = { message: string; mode?: AssistantMode; model?: string | null; toolsUsed?: string[] };
type Message = { id: string; role: "assistant" | "user"; content: string; response?: AssistantResponse };
type SavedChat = { id: string; title: string; updatedAt: string; messages: Message[] };

function welcomeMessage(workspaceName: string): Message {
  return {
    id: "welcome",
    role: "assistant",
    content: `Assalam-o-alaikum! Main ${workspaceName} ka live MunshiOS data dekh kar sales, inventory, khata, receivables, payables aur reports ke sawal answer karta hoon. Main khud se koi financial record change nahi karta.`,
  };
}

function titleFromQuestion(question: string) {
  return question.length > 58 ? `${question.slice(0, 58).trim()}…` : question;
}

export function AssistantChat({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const storageKey = `munshios:ai-history:${workspaceId}`;
  const [input, setInput] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [messages, setMessages] = useState<Message[]>(() => [welcomeMessage(workspaceName)]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { version?: number; chats?: SavedChat[] };
        const chats = Array.isArray(parsed.chats) ? parsed.chats.slice(0, MAX_SAVED_CHATS) : [];
        setSavedChats(chats);
        if (chats[0]) {
          setActiveChatId(chats[0].id);
          setMessages(chats[0].messages.length ? chats[0].messages : [welcomeMessage(workspaceName)]);
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setHydrated(true);
    }
  }, [storageKey, workspaceName]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const latestMode = [...messages].reverse().find((message) => message.role === "assistant" && message.response?.mode)?.response?.mode;
  const filteredChats = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return savedChats;
    return savedChats.filter((chat) => chat.title.toLowerCase().includes(query) || chat.messages.some((message) => message.content.toLowerCase().includes(query)));
  }, [historySearch, savedChats]);

  function writeChats(updater: (current: SavedChat[]) => SavedChat[]) {
    setSavedChats((current) => {
      const next = updater(current).slice(0, MAX_SAVED_CHATS);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, chats: next }));
      } catch {
        // Chat continues even if browser storage is unavailable/full.
      }
      return next;
    });
  }

  function persistChat(chatId: string, chatMessages: Message[], fallbackTitle: string) {
    writeChats((current) => {
      const existing = current.find((chat) => chat.id === chatId);
      const updated: SavedChat = {
        id: chatId,
        title: existing?.title || fallbackTitle,
        updatedAt: new Date().toISOString(),
        messages: chatMessages.slice(-80),
      };
      return [updated, ...current.filter((chat) => chat.id !== chatId)];
    });
  }

  function startNewChat() {
    if (busy) return;
    setActiveChatId(null);
    setMessages([welcomeMessage(workspaceName)]);
    setInput("");
  }

  function openChat(chat: SavedChat) {
    if (busy) return;
    setActiveChatId(chat.id);
    setMessages(chat.messages.length ? chat.messages : [welcomeMessage(workspaceName)]);
    setInput("");
  }

  function deleteChat(chatId: string) {
    if (!window.confirm("Delete this Ask Munshi chat history?")) return;
    writeChats((current) => current.filter((chat) => chat.id !== chatId));
    if (activeChatId === chatId) startNewChat();
  }

  async function submit(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || busy) return;

    const history = messages.filter((message) => message.id !== "welcome").slice(-10).map((message) => ({ role: message.role, content: message.content }));
    const chatId = activeChatId ?? crypto.randomUUID();
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: cleanQuestion };
    const withUser = [...messages, userMessage];
    const chatTitle = titleFromQuestion(cleanQuestion);

    setActiveChatId(chatId);
    setInput("");
    setBusy(true);
    setMessages(withUser);
    persistChat(chatId, withUser, chatTitle);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion, history }),
      });
      const payload = await response.json().catch(() => null) as { data?: AssistantResponse; error?: { message?: string } } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error?.message || "Assistant request failed.");
      const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", content: payload.data.message, response: payload.data };
      const next = [...withUser, assistantMessage];
      setMessages(next);
      persistChat(chatId, next, chatTitle);
    } catch {
      const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", content: "Live assistant abhi response nahi de saka. Koi business record change nahi hua. Dobara try karein." };
      const next = [...withUser, assistantMessage];
      setMessages(next);
      persistChat(chatId, next, chatTitle);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(input);
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-white">
      <aside className="hidden w-72 shrink-0 flex-col border-r bg-neutral-50/80 md:flex">
        <div className="border-b p-3">
          <Button type="button" onClick={startNewChat} className="w-full justify-start gap-2"><Plus className="size-4" />New chat</Button>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
            <Input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search Ask Munshi history" className="h-9 pl-8 text-xs" />
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400"><History className="size-3.5" />History</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {!hydrated ? <p className="px-2 py-3 text-xs text-neutral-400">Loading history…</p> : filteredChats.length === 0 ? <p className="px-2 py-3 text-xs leading-5 text-neutral-400">No saved chats yet. Your Ask Munshi questions will appear here on this device.</p> : filteredChats.map((chat) => (
            <div key={chat.id} className={`group mb-1 flex items-start rounded-lg ${activeChatId === chat.id ? "bg-white shadow-sm ring-1 ring-neutral-200" : "hover:bg-white"}`}>
              <button type="button" onClick={() => openChat(chat)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                <p className="truncate text-xs font-medium text-neutral-800">{chat.title}</p>
                <p className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400"><Clock3 className="size-3" />{new Date(chat.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </button>
              <button type="button" onClick={() => deleteChat(chat.id)} className="mr-1 mt-2 rounded p-1.5 text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100" aria-label={`Delete ${chat.title}`}><Trash2 className="size-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="border-t px-3 py-2 text-[10px] leading-4 text-neutral-400">History is saved locally on this device and separated by workspace.</div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><Sparkles className="size-4" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Ask MunshiOS</p>
              <h1 className="truncate text-base font-semibold text-neutral-950 sm:text-lg">{activeChatId ? savedChats.find((chat) => chat.id === activeChatId)?.title || "Business assistant" : "New business question"}</h1>
            </div>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700"><Database className="size-3" />{latestMode === "groq" ? "Groq + live data" : latestMode === "live-fallback" ? "Live data" : "Live workspace"}</span>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Ask in English or Roman Urdu. Read-only by design: answers are scoped to {workspaceName} and financial records are never changed from chat.</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <Button type="button" variant="outline" size="sm" onClick={startNewChat} className="shrink-0 md:hidden"><Plus className="size-3.5" />New chat</Button>
            {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void submit(suggestion)} disabled={busy} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"><MessageSquare className="size-3" />{suggestion}</button>)}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex gap-3"}>
                {message.role === "assistant" && <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Sparkles className="size-4" /></span>}
                <div className="max-w-[92%] space-y-1.5 sm:max-w-[82%] lg:max-w-[76%]">
                  <div className={message.role === "user" ? "whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-neutral-900 px-4 py-3 text-sm leading-6 text-white" : "whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-neutral-100 px-4 py-3 text-sm leading-6 text-neutral-800"}>{message.content}</div>
                  {message.role === "assistant" && message.response?.mode === "live-fallback" && <p className="pl-1 text-[10px] text-neutral-400">Answered from verified live MunshiOS data. Groq reasoning was unavailable or unnecessary.</p>}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-3 text-sm text-neutral-400"><span className="flex size-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Sparkles className="size-4 animate-pulse" /></span>Checking live business data…</div>}
            <div ref={endRef} />
          </div>
        </div>

        <footer className="border-t bg-white p-3 sm:p-4">
          <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-5xl gap-2">
            <Input value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} placeholder="Apne live business ke baare mein poochain…" className="h-11 flex-1" aria-label="Message the business assistant" />
            <Button type="submit" size="icon-lg" disabled={busy || !input.trim()} aria-label="Send message"><Send /></Button>
          </form>
        </footer>
      </section>
    </div>
  );
}
