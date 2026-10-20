'use client';
import { useRouter } from "next/navigation";

export default function Home() {

  const router = useRouter();

  const handleSpeak = () => {
    router.push('voice-interface')
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <h1>This is SPACT - SPEAK IT, DO IT </h1>
        <button onClick={handleSpeak}>speak</button>
    </div>
  );
}
