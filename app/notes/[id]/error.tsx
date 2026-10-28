"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">Could not load this note</h1>
      <button onClick={reset} className="mt-6 rounded-lg border px-4 py-2">
        Try again
      </button>
    </main>
  );
}
