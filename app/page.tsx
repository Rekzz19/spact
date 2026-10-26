"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import LogoutButton from "@/app/components/LogoutButton";

export default function Home() {
  const [authStatus, setAuthStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  useEffect(() => {
    async function init() {
      try {
        const response = await fetch("/api/auth/session", {
          //checkst the user has a session
          method: "GET", //which endpoint does this go to?
        });

        if (response.status === 401) {
          setAuthStatus("unauthenticated"); //give them an anonymous identity
          return;
        }

        if (!response.ok) {
          throw new Error("Session check failed"); //print failed
        }

        // Existing student session
        setAuthStatus("authenticated");
      } catch (error) {
        console.error("Authentication error:", error);
        setAuthStatus("unauthenticated");
      }
    }

    init();
  }, []);

  const router = useRouter();

  const handleSpeak = () => {
    router.push("voice-interface");
  };

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="flex justify-end p-6">
        <LogoutButton />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <h1>This is SPACT - SPEAK IT, DO IT </h1>
        <button onClick={handleSpeak}>speak</button>
      </main>
    </div>
  );
}
