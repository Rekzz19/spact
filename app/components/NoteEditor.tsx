"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Fields = { title: string; content: string };
const same = (a: Fields, b: Fields) =>
  a.title === b.title && a.content === b.content;

export default function NoteEditor({
  id,
  title,
  body,
}: {
  id: string;
  title: string;
  body: string;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>({ title, content: body });
  const [status, setStatus] = useState<
    "saved" | "unsaved" | "saving" | "error"
  >("saved");
  const [error, setError] = useState("");
  const latest = useRef(fields);
  const saved = useRef(fields);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    if (inFlight.current) return inFlight.current;
    const run = async () => {
      // Serialize requests and save newer edits after the current request finishes.
      while (!same(latest.current, saved.current)) {
        const snapshot = { ...latest.current };
        if (!snapshot.title.trim()) {
          if (mounted.current) {
            setError("Add a title so your note can be saved.");
            setStatus("error");
          }
          return false;
        }
        if (mounted.current) {
          setStatus("saving");
          setError("");
        }
        try {
          const response = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(snapshot),
            keepalive: true,
          });
          if (!response.ok) {
            const result = await response.json();
            throw new Error(
              result.error || "Could not save note. Your edits are still here.",
            );
          }
          saved.current = snapshot;
        } catch (err) {
          if (mounted.current) {
            setError(
              err instanceof Error
                ? err.message
                : "Could not save note. Your edits are still here.",
            );
            setStatus("error");
          }
          return false;
        }
      }
      if (mounted.current) setStatus("saved");
      return true;
    };
    const task = run().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = task;
    return task;
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (same(latest.current, saved.current) && !inFlight.current) return;
      void flush();
      event.preventDefault();
      event.returnValue = "";
    };
    const pageHide = () => {
      void flush();
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        (same(latest.current, saved.current) && !inFlight.current)
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      void flush().then((success) => {
        if (success && mounted.current)
          router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", pageHide);
    document.addEventListener("click", navigate, true);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      void flush();
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", pageHide);
      document.removeEventListener("click", navigate, true);
    };
  }, [flush, router]);

  function edit(next: Fields) {
    latest.current = next;
    setFields(next);
    setError("");
    setStatus(
      same(next, saved.current) && !inFlight.current ? "saved" : "unsaved",
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush();
    }, 750);
  }

  return (
    <article className="mx-auto w-full max-w-3xl">
      <label htmlFor="note-title" className="sr-only">
        Note title
      </label>
      <input
        id="note-title"
        value={fields.title}
        maxLength={200}
        onChange={(event) =>
          edit({ ...latest.current, title: event.target.value })
        }
        onBlur={() => void flush()}
        className="mb-3 w-full rounded-lg border border-transparent bg-transparent px-2 py-2 text-3xl font-bold tracking-tight outline-none focus:border-blue-500"
      />
      <div className="mb-6 flex min-h-6 items-center gap-3 px-2 text-sm text-zinc-500 dark:text-zinc-400">
        <span role="status">
          {status === "saved"
            ? "Saved"
            : status === "saving"
              ? "Saving…"
              : status === "error"
                ? "Not saved"
                : "Unsaved changes"}
        </span>
        {status === "error" && (
          <button
            type="button"
            onClick={() => void flush()}
            className="text-blue-500 underline underline-offset-4"
          >
            Retry
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-4 px-2 text-sm text-red-500">
          {error}
        </p>
      )}
      <label htmlFor="note-body" className="sr-only">
        Note body
      </label>
      <textarea
        id="note-body"
        value={fields.content}
        maxLength={20000}
        onChange={(event) =>
          edit({ ...latest.current, content: event.target.value })
        }
        onBlur={() => void flush()}
        className="min-h-[60vh] w-full resize-y rounded-lg border border-transparent bg-transparent px-2 py-3 text-lg leading-relaxed outline-none focus:border-blue-500"
      />
    </article>
  );
}
