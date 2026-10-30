import Link from "next/link";
import type { ReactNode } from "react";

export const authInputClass =
  "w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-zinc-600 dark:bg-white/5 placeholder:text-zinc-400";
export const authButtonClass =
  "mt-2 w-full rounded-full bg-blue-600 px-6 py-3.5 font-medium text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

export default function AuthShell({
  mode,
  children,
}: {
  mode: "login" | "register" | "set-password";
  children: ReactNode;
}) {
  const login = mode === "login";
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{
        backgroundColor: "light-dark(#fafafa, #202124)",
        color: "light-dark(#18181b, #f4f4f5)",
        colorScheme: "light dark",
        fontFamily: "var(--font-geist-sans), Arial, sans-serif",
      }}
    >
      <header className="flex items-center justify-between px-6 py-7 sm:px-10">
        <Link
          href="/"
          className="rounded text-2xl font-bold tracking-tight text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
        >
          Spact
        </Link>
        <Link
          href="/voice-interface"
          className="text-sm text-zinc-500 transition hover:text-blue-600 dark:text-zinc-400"
        >
          Back to voice <span aria-hidden="true">↗</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-20 pt-8 sm:px-8">
        <section
          aria-labelledby="auth-title"
          className="w-full max-w-md rounded-3xl border p-7 shadow-xl shadow-black/5 sm:p-10"
          style={{
            backgroundColor: "light-dark(#ffffff, #252629)",
            borderColor: "light-dark(#e4e4e7, #3f4044)",
          }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
            Your revision starts here
          </p>
          <h1 id="auth-title" className="text-3xl font-semibold tracking-tight">
            {mode === "set-password"
              ? "Make it yours."
              : login
                ? "Welcome back."
                : "Make knowledge stick."}
          </h1>
          <p className="mb-8 mt-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {mode === "set-password"
              ? "Create a password to secure your Spact account and get back to learning."
              : login
                ? "Log in to pick up where you left off."
                : "Create your Spact account. We’ll email you a link to verify your email and set your password."}
          </p>
          {children}
          <p className="mt-7 border-t border-zinc-200 pt-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            {login ? "New to Spact? " : "Already have an account? "}
            <Link
              href={login ? "/register" : "/login"}
              className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
            >
              {login ? "Create an account" : "Log in"}
            </Link>
          </p>
        </section>
      </main>
      <footer className="px-6 pb-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Say it. Remember it.
      </footer>
    </div>
  );
}
