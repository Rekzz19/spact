"use client";
import { useRouter } from "next/navigation";
import LogoutButton from "@/app/components/LogoutButton";

export default function Home() {
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
