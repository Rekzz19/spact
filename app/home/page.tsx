"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import LogoutButton from "@/app/components/LogoutButton";
import AnimatedText from "@/app/components/AnimatedText";

const headlineWords = ["Remember", "Understand", "Master", "Own"] as const;

export default function Home() {
  const [authStatus, setAuthStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  useEffect(() => {
    async function init() {
      try {
        const response = await fetch("/api/auth/session", {
          //checkst the user has a session
          method: "GET",
        });

        if (response.status === 401) {
          setAuthStatus("unauthenticated");
          return;
        }

        if (!response.ok) {
          throw new Error("Session check failed");
        }

        const session = await response.json();
        setAuthStatus(
          session.authenticated && !session.anonymous
            ? "authenticated"
            : "unauthenticated",
        );
      } catch (error) {
        console.error("Authentication error:", error);
        setAuthStatus("unauthenticated");
      }
    }

    init();
  }, []);

  const router = useRouter();

  const handleSpeak = () => {
    router.push("/");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "#171717",
        backgroundColor: "#fff",
        backgroundImage: [
          "linear-gradient(to right, rgba(37, 99, 235, 0.09) 0.5px, transparent 0.5px)",
          "linear-gradient(to bottom, rgba(37, 99, 235, 0.09) 0.5px, transparent 0.5px)",
          "radial-gradient(ellipse at 15% 45%, rgba(255, 255, 255, 0.85) 0%, transparent 65%)",
          "radial-gradient(ellipse at 90% 85%, rgba(96, 165, 250, 0.45) 0%, transparent 60%)",
          "linear-gradient(165deg, #ffffff 0%, #f8fbff 18%, #edf5ff 35%, #dbeafe 50%, #b4d2fc 65%, #7aa8f4 80%, #2563eb 100%)",
        ].join(", "),
        backgroundSize: "10px 10px, 10px 10px, 100% 100%, 100% 100%, 100% 100%",
      }}
      className="flex flex-1 flex-col font-sans"
    >
      <header className="relative z-10 flex items-center justify-between p-6">
        <Link
          href="/"
          className="rounded text-2xl font-bold tracking-tight text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
        >
          Spact
        </Link>
        {authStatus === "authenticated" && <LogoutButton />}
        {authStatus === "unauthenticated" && (
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Sign up
          </Link>
        )}
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-20 text-center sm:px-8">
        <section
          aria-label="Your AI revision partner"
          className="flex w-full max-w-6xl flex-col items-center"
        >
          <h1
            className="font-semibold tracking-tight"
            style={{
              fontSize: "clamp(1.75rem, 5.6vw, 5.5rem)",
              lineHeight: 1.2,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              columnGap: "0.25em",
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>Say it.</span>
            <span style={{ whiteSpace: "nowrap" }}>
              <AnimatedText words={headlineWords} /> it.
            </span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-zinc-700 sm:text-xl">
            Your AI revision partner. Talk through what you&apos;ve learned,
            challenge your understanding, and make knowledge stick.
          </p>
          <button
            type="button"
            onClick={handleSpeak}
            className="mt-9 rounded-full bg-blue-600 px-8 py-4 font-medium text-white shadow-lg shadow-blue-600/15 transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
          >
            Start speaking
          </button>
        </section>
      </main>
    </div>
  );
}
