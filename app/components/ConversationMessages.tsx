"use client";

import { useLayoutEffect, useRef } from "react";
import type { DisplayMessage } from "@/lib/conversations/chat-state";

export default function ConversationMessages({
  messages,
}: {
  messages: DisplayMessage[];
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!mounted.current || reduceMotion) {
      // Restore the scroll position before paint, without a visible trip down the chat.
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
    mounted.current = true;
  }, [messages]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div
        role="log"
        aria-label="Revision conversation"
        aria-live="polite"
        aria-relevant="additions"
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 sm:px-8"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            aria-label={
              message.role === "user" ? "Your message" : "Spact's response"
            }
            className={`max-w-[90%] rounded-2xl px-5 py-4 sm:max-w-[85%] ${message.role === "user" ? "self-end bg-blue-600 text-white" : "self-start border border-zinc-200 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-white/5 dark:text-zinc-100"}`}
          >
            <h2 className="mb-1 text-xs font-semibold opacity-70">
              {message.role === "user" ? "You" : "Spact"}
            </h2>
            <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
              {message.content}
            </p>
            {message.status === "sending" && (
              <p className="mt-2 text-xs opacity-70">Waiting for Spact…</p>
            )}
            {message.status === "failed" && (
              <p className="mt-2 text-xs">
                Message could not be saved. Please try again.
              </p>
            )}
          </article>
        ))}
        <div ref={endRef} aria-hidden="true" />
      </div>
    </div>
  );
}
