"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SpeechPlayer } from "@/lib/audio/speech-player";
import type { createDiagnostics } from "@/lib/diagnostics/client";

export function useSpeechPlayback(onError: (message: string) => void) {
  const player = useRef<SpeechPlayer | null>(null);
  const [state, setState] = useState<"idle" | "speaking" | "blocked">("idle");
  useEffect(() => {
    const instance = new SpeechPlayer(setState, onError);
    player.current = instance;
    return () => {
      player.current = null;
      instance.dispose();
    };
  }, [onError]);
  const stop = useCallback(() => player.current?.stop(), []);
  const unlock = useCallback(() => player.current?.unlock(), []);
  const retry = useCallback(() => {
    void player.current
      ?.retry()
      .catch(() => onError("Speech playback failed. Please try again."));
  }, [onError]);
  const play = useCallback(
    async (
      blob: Blob,
      diagnostics: ReturnType<typeof createDiagnostics>,
      sinceGestureMs: number,
    ) => {
      await player.current?.play(blob, diagnostics, sinceGestureMs);
    },
    [],
  );
  return {
    isSpeaking: state === "speaking",
    needsPlay: state === "blocked",
    stop,
    unlock,
    retry,
    play,
  };
}
