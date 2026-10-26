"use client";

import Link from "next/link";
import { useRef, useState } from "react";

export default function Sidebar() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

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
        }}
        className="rounded-lg border p-2 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-zinc-900"
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
        className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-72 max-w-[85vw] border-r border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/30 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <div className="flex h-full flex-col overflow-y-auto p-6">
          <div className="mb-8 flex items-center justify-between">
            <h2 id="sidebar-title" className="text-xl font-bold">
              Spact
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
              onClick={close}
              className="rounded-lg px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Home
            </Link>
            <Link
              href="/voice-interface"
              onClick={close}
              aria-current="page"
              className="rounded-lg bg-zinc-100 px-3 py-2 font-medium dark:bg-zinc-900"
            >
              Voice
            </Link>
          </nav>
          <p className="mt-auto pt-8 text-sm text-zinc-500">Say it, do it.</p>
        </div>
      </dialog>
    </>
  );
}
