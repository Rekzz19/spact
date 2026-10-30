"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

export default function Sidebar() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [notes, setNotes] = useState<{ id: string; title: string }[]>([]);
  const [notesStatus, setNotesStatus] = useState<
    "loading" | "ready" | "error" | "unauthorised"
  >("loading");

  async function loadNotes() {
    setNotesStatus("loading");
    setNotes([]);
    try {
      const response = await fetch("/api/notes", { cache: "no-store" });
      if (response.status === 401) {
        setNotesStatus("unauthorised");
        return;
      }
      if (!response.ok) throw new Error("Failed to load notes");
      const data = await response.json();
      setNotes(data.notes);
      setNotesStatus("ready");
    } catch {
      setNotesStatus("error");
    }
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open sidebar"
        aria-controls="voice-sidebar"
        aria-expanded={open}
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
          void loadNotes();
        }}
        className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border p-2 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-zinc-900"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <dialog
        id="voice-sidebar"
        ref={dialogRef}
        aria-labelledby="sidebar-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close();
        }}
        className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-72 max-w-[85vw] border-r border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/30 dark:border-zinc-800 dark:bg-[#202124] dark:text-zinc-100"
      >
        <div className="flex h-full flex-col overflow-y-auto p-6">
          <div className="mb-8 flex items-center justify-between">
            <h2 id="sidebar-title" className="text-xl font-bold">
              <Link href="/" onClick={close}>
                Spact
              </Link>
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close sidebar"
              className="rounded-lg border p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M6 18 18 6" />
              </svg>
            </button>
          </div>
          <nav aria-label="Main navigation" className="flex flex-col gap-2">
            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              onClick={close}
              className="rounded-lg px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Home
            </Link>
          </nav>
          <section aria-labelledby="notes-title" className="mt-8">
            <h2
              id="notes-title"
              className="mb-3 px-3 text-sm font-semibold text-zinc-500"
            >
              Notes
            </h2>
            {notesStatus === "loading" && (
              <p role="status" className="px-3 text-sm text-zinc-500">
                Loading notes…
              </p>
            )}
            {notesStatus === "unauthorised" && (
              <p className="px-3 text-sm text-zinc-500">
                Start a conversation or log in to see your notes.
              </p>
            )}
            {notesStatus === "error" && (
              <div className="px-3 text-sm">
                <p role="alert">Could not load notes.</p>
                <button
                  onClick={() => void loadNotes()}
                  className="mt-2 underline"
                >
                  Try again
                </button>
              </div>
            )}
            {notesStatus === "ready" && notes.length === 0 && (
              <p className="px-3 text-sm text-zinc-500">No saved notes yet.</p>
            )}
            <nav aria-label="Saved notes" className="flex flex-col gap-2">
              {notes.map((note) => (
                <Link
                  key={note.id}
                  href={`/notes/${encodeURIComponent(note.id)}`}
                  onClick={close}
                  aria-current={
                    pathname === `/notes/${note.id}` ? "page" : undefined
                  }
                  className="break-words rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 aria-[current=page]:bg-zinc-100 dark:hover:bg-zinc-900 dark:aria-[current=page]:bg-zinc-900"
                >
                  {note.title}
                </Link>
              ))}
            </nav>
          </section>
          <p className="mt-auto pt-8 text-sm text-zinc-500">Say it, do it.</p>
        </div>
      </dialog>
    </>
  );
}
