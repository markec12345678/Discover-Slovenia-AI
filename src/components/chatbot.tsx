"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Sparkles,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  message: string;
  source: "puter" | "z-ai-sdk" | "fallback";
  timestamp: string;
}

const QUICK_PROMPTS = [
  "Kaj obiskati v Sloveniji?",
  "Priporoči romantični vikend",
  "Kje je najboljša hrana?",
  "Kam z družino?",
];

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Pozdravljen! 🇸🇮 Sem Slovenija AI — vaš osebni vodič po Sloveniji. Vprašajte me o destinacijah, lokalcih, izdelkih ali izkušnjah. Kako vam lahko pomagam?",
};

/**
 * Chatbot — lebdeči AI asistent z dostopom do vsebine platforme.
 *
 * Pozna: destinacije, lokale, izdelke, izkušnje, dogodke, AI itinerer.
 * Kontekst se gradi iz baze in pošlje GLM-ju (Puter API).
 * Fallback: deterministični odgovori če AI odpove.
 */
export function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"puter" | "z-ai-sdk" | "fallback">("puter");
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll na dno ko pride novo sporočilo
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus na input ko se odpre
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Reset ko se zapre
      setHasNewMessage(false);
    }
  }, [open]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          currentPage: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });

      if (!res.ok) throw new Error("Napaka pri chatu");

      const data: ChatResponse = await res.json();
      setSource(data.source);
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);

      if (!open) setHasNewMessage(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Oprostite, trenutno imam težave z povezavo. Poskusite znova ali pa obiščite AI načrtovalec v sekciji #načrtuj.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <>
      {/* Lebdeči gumb (spodaj desno) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:bottom-6 sm:right-6"
        aria-label={open ? "Zapri chatbot" : "Odpri AI chatbot"}
        aria-expanded={open}
      >
        {open ? (
          <X className="size-6" aria-hidden="true" />
        ) : (
          <>
            <MessageCircle className="size-6" aria-hidden="true" />
            {hasNewMessage && (
              <span className="absolute -right-1 -top-1 flex size-4">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-4 rounded-full bg-red-500" />
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 flex h-[32rem] max-h-[calc(100vh-6rem)] w-[calc(100vw-2rem)] flex-col rounded-2xl border border-border bg-background shadow-2xl sm:right-6 sm:w-96"
          role="dialog"
          aria-label="AI chatbot pogovor"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border bg-primary/5 p-4 rounded-t-2xl">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Bot className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="flex items-center gap-1.5 text-sm font-bold">
                Slovenija AI
                <Badge
                  variant="secondary"
                  className={cn(
                    "gap-1 text-[9px]",
                    source === "fallback"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  )}
                >
                  <Sparkles className="size-2.5" aria-hidden="true" />
                  {source === "fallback" ? "fallback" : "AI"}
                </Badge>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Vaš osebni vodič po Sloveniji
              </p>
            </div>
          </div>

          {/* Sporočila */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-4"
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                    msg.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted"
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}

            {/* Quick prompts (samo ko je samo welcome message) */}
            {messages.length === 1 && !loading && (
              <div className="space-y-2 pt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Hitra vprašanja
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendMessage(prompt)}
                      className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">AI razmišlja...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-border p-3">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Vprašajte o Sloveniji..."
                disabled={loading}
                maxLength={500}
                className="flex-1"
                aria-label="Sporočilo za AI chatbot"
              />
              <Button
                type="submit"
                size="icon"
                disabled={loading || !input.trim()}
                className="shrink-0"
                aria-label="Pošlji sporočilo"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
