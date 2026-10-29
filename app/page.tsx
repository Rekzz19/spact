"use client";

import { useRef, useState, useEffect, useReducer, useCallback } from "react";
import Link from "next/link";
import LogoutButton from "@/app/components/LogoutButton";
import Sidebar from "@/app/components/Sidebar";
import ConversationMessages from "@/app/components/ConversationMessages";
import { chatReducer, emptyChat } from "@/lib/conversations/chat-state";
import {
  createDiagnostics,
  playbackDiagnostics,
} from "@/lib/diagnostics/client";

function releaseSpeech(playback: { audio: HTMLAudioElement; url: string }) {
  playback.audio.onplaying = null;
  playback.audio.onended = null;
  playback.audio.onerror = null;
  playback.audio.pause();
  playback.audio.currentTime = 0;
  URL.revokeObjectURL(playback.url);
}

export default function Home() {
  const recorderRef = useRef<MediaRecorder | null>(null); //understand ref, why ref?
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(
    null,
  );
  const speechRequestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const speechDiagnosticsRef = useRef<ReturnType<
    typeof createDiagnostics
  > | null>(null);
  const gestureAtRef = useRef(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const stopSpeaking = useCallback(() => {
    const playback = speechRef.current;
    speechRef.current = null;
    if (playback) {
      speechDiagnosticsRef.current?.record(
        "speech.stopped",
        playbackDiagnostics(playback.audio),
        true,
      );
      releaseSpeech(playback);
    }
    speechDiagnosticsRef.current = null;
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      speechRequestRef.current?.abort();
      const playback = speechRef.current;
      speechRef.current = null;
      if (playback) {
        speechDiagnosticsRef.current?.record(
          "speech.stopped",
          { stage: "unmount" },
          true,
        );
        releaseSpeech(playback);
      }
    };
  }, []);

  const [recording, setRecording] = useState(false);
  const [chat, dispatchChat] = useReducer(chatReducer, emptyChat);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const busyRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const conversationIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const [authStatus, setAuthStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  // Restore only: opening or refreshing this page never creates a conversation.
  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    let version = 0;
    let checked = false;

    async function initialiseUser() {
      if (busyRef.current) return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const requestVersion = ++version;
      const stale = () =>
        cancelled || signal.aborted || requestVersion !== version;
      let identityVerified = false;
      let restoreStage = "session_fetch";
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          signal,
        });
        if (stale()) return;
        if (response.status === 401) {
          userIdRef.current = null;
          conversationIdRef.current = null;
          dispatchChat({ type: "reset", userId: null });
          setAuthStatus("unauthenticated");
          return;
        }
        if (!response.ok) throw new Error("Session check failed");
        const session = await response.json();
        if (stale()) return;
        const userId = session.authenticated ? session.userId : null;
        if (typeof userId !== "string") throw new Error("Session check failed");
        identityVerified = true;
        const sameUser = userIdRef.current === userId;
        setAuthStatus(session.anonymous ? "unauthenticated" : "authenticated");
        // Focus checks identity without repeatedly fetching the same history.
        if (sameUser && checked) return;
        checked = true;
        userIdRef.current = userId;
        conversationIdRef.current = null;
        dispatchChat({ type: "reset", userId });
        const storageKey = `conversationId:${userId}`;
        restoreStage = "storage_read";
        const id = sessionStorage.getItem(storageKey);
        if (!id) return;
        conversationIdRef.current = id;
        restoreStage = "messages_fetch";
        const historyResponse = await fetch(
          `/api/conversations/${encodeURIComponent(id)}/messages?activeOnly=true`,
          { cache: "no-store", signal },
        );
        if (stale()) return;
        const history = await historyResponse.json();
        if (stale()) return;
        if (!historyResponse.ok) {
          if (
            historyResponse.status === 400 ||
            historyResponse.status === 404
          ) {
            sessionStorage.removeItem(storageKey);
            conversationIdRef.current = null;
          }
          throw new Error(
            history.error || "Could not restore your conversation.",
          );
        }
        if (history.userId !== userId) {
          userIdRef.current = null;
          conversationIdRef.current = null;
          dispatchChat({ type: "reset", userId: null });
          throw new Error("Your session changed. Please reload the page.");
        }
        dispatchChat({
          type: "restore",
          userId,
          conversationId: id,
          messages: history.active ? history.messages : [],
        });
      } catch (err) {
        if (stale()) return;
        if (!identityVerified) {
          userIdRef.current = null;
          conversationIdRef.current = null;
          dispatchChat({ type: "reset", userId: null });
          setAuthStatus("unauthenticated");
        }
        checked = false;
        createDiagnostics().record(
          "history.failed",
          { stage: restoreStage, error: err },
          true,
        );
        setHistoryError(
          err instanceof Error
            ? err.message
            : "Could not restore your conversation.",
        );
      } finally {
        if (!stale()) setHistoryLoading(false);
      }
    }
    void initialiseUser();
    window.addEventListener("focus", initialiseUser);
    return () => {
      cancelled = true;
      controller?.abort();
      window.removeEventListener("focus", initialiseUser);
    };
  }, [restoreAttempt]);

  async function initialiseConversation() {
    if (conversationIdRef.current) return conversationIdRef.current;

    // Create a guest only when they send their first recording.
    // Existing guest sessions can be reused without creating another identity.
    if (!userIdRef.current) {
      const anonymousUser = await fetch("/api/auth/anonymous", {
        //get anonymous identity
        method: "POST",
      });

      if (!anonymousUser.ok) throw new Error("Failed to initialise user");

      //successfully creates an anonymous user.
      const user = await anonymousUser.json();
      userIdRef.current = user.userId;
      dispatchChat({ type: "reset", userId: user.userId });
    }
    if (!userIdRef.current) throw new Error("Failed to initialise user"); //HOW DO I HANDLE THIS SCENERIO

    // Do not reuse a conversation left behind by a different account.
    const storageKey = `conversationId:${userIdRef.current}`;
    const existingId = sessionStorage.getItem(storageKey);
    if (existingId) {
      conversationIdRef.current = existingId; //IS STORING CONVO ID NECESSARY - YES SO IT DOESNT LOSE CONVO ID ON REFRESH
      return existingId;
    }

    const response = await fetch("/api/superbase-conversations", {
      //this stored the convo
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to create conversation");
    const data = await response.json();
    if (typeof data.conversationId !== "string")
      throw new Error("Invalid conversation response");
    sessionStorage.setItem(storageKey, data.conversationId);
    conversationIdRef.current = data.conversationId;
    return data.conversationId;
  }

  async function startRecording() {
    try {
      setError("");
      busyRef.current = true;

      const stream = await navigator.mediaDevices.getUserMedia({
        //user audio input
        audio: true,
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream); //new record event
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        //pushing the audio event data to the Blob - file like object containing raw data
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      //at the end of recording data
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType,
        });

        const formData = new FormData();
        formData.append("audio", audioBlob, "recording");

        setLoading(true); //frontend loading message

        let speechDiagnostics: ReturnType<typeof createDiagnostics> | null =
          null;
        let speechStage = "request";
        let pendingId: string | null = null;
        let requestUserId: string | null = null;
        //api sending the audio data
        try {
          await initialiseConversation();
          requestUserId = userIdRef.current;

          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Transcription failed");
          }

          if (!requestUserId || userIdRef.current !== requestUserId)
            throw new Error("Your session changed. Please reload the page.");
          pendingId = `local:${crypto.randomUUID()}`;
          dispatchChat({
            type: "transcript",
            userId: requestUserId,
            conversationId: conversationIdRef.current!,
            message: {
              id: pendingId,
              role: "user",
              content: data.transcript,
              created_at: new Date().toISOString(),
              status: "sending",
            },
          });

          //after setting transcript send tp chat endpoint
          const chatResponse = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              transcript: data.transcript,
              conversationId: conversationIdRef.current,
            }),
          });

          const chatData = await chatResponse.json();
          if (!chatResponse.ok) {
            if (chatResponse.status === 401) {
              userIdRef.current = null;
              conversationIdRef.current = null;
              dispatchChat({ type: "reset", userId: null });
              setAuthStatus("unauthenticated");
            }
            throw new Error(chatData.error || "Nebius request failed");
          }
          if (
            chatData.userId !== requestUserId ||
            userIdRef.current !== requestUserId
          ) {
            userIdRef.current = null;
            conversationIdRef.current = null;
            dispatchChat({ type: "reset", userId: null });
            throw new Error("Your session changed. Please reload the page.");
          }
          if (
            typeof chatData.conversationId !== "string" ||
            !chatData.conversationId
          ) {
            throw new Error("Invalid conversation response");
          }
          conversationIdRef.current = chatData.conversationId;
          sessionStorage.setItem(
            `conversationId:${userIdRef.current}`,
            chatData.conversationId,
          );
          dispatchChat({
            type: "reply",
            userId: requestUserId,
            conversationId: chatData.conversationId,
            pendingId,
            message: {
              id: `reply:${pendingId}`,
              role: "assistant",
              content: chatData.reply,
              created_at: new Date().toISOString(),
              status: "saved",
            },
          });

          //send AI res to deepgram speech
          if (!mountedRef.current) return;
          speechRequestRef.current?.abort();
          const speechController = new AbortController();
          speechRequestRef.current = speechController;
          speechDiagnostics = createDiagnostics();
          speechDiagnostics.record("speech.request.started", {
            ...playbackDiagnostics(),
            sinceGestureMs: Math.round(
              performance.now() - gestureAtRef.current,
            ),
          });
          const speechResponse = await fetch("/api/speak", {
            method: "POST",
            signal: speechController.signal,
            headers: {
              "Content-Type": "application/json",
              "X-Spact-Speech-Id": speechDiagnostics.attemptId,
            },
            body: JSON.stringify({
              AiRes: chatData.reply,
            }),
          });
          speechDiagnostics.record("speech.response.received", {
            status: speechResponse.status,
            mimeType: speechResponse.headers.get("Content-Type"),
          });
          //handle res
          if (!speechResponse.ok) {
            throw new Error("Speech generation failed");
          }

          speechStage = "audio_download";
          const audioBlob = await speechResponse.blob();
          speechDiagnostics.record("speech.audio.received", {
            bytes: audioBlob.size,
            mimeType: audioBlob.type,
          });
          if (!mountedRef.current || speechController.signal.aborted) return;
          stopSpeaking();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          const playback = { audio, url: audioUrl };
          speechRef.current = playback;
          speechDiagnosticsRef.current = speechDiagnostics;
          const diagnostics = speechDiagnostics;

          audio.onplaying = () => {
            if (speechRef.current === playback) {
              diagnostics.record(
                "speech.play.started",
                playbackDiagnostics(audio),
                true,
              );
              setIsSpeaking(true);
            }
          };
          audio.onended = () => {
            if (speechRef.current === playback) {
              diagnostics.record(
                "speech.ended",
                playbackDiagnostics(audio),
                true,
              );
              speechDiagnosticsRef.current = null;
              stopSpeaking();
            }
          };
          audio.onerror = () => {
            if (speechRef.current !== playback) return;
            diagnostics.record(
              "speech.media.error",
              {
                ...playbackDiagnostics(audio),
                errorMessage: audio.error?.message,
              },
              true,
            );
            speechDiagnosticsRef.current = null;
            stopSpeaking();
            setError("Speech playback failed. Please try again.");
          };
          //play audio
          speechStage = "playback";
          diagnostics.record("speech.play.requested", {
            ...playbackDiagnostics(audio),
            sinceGestureMs: Math.round(
              performance.now() - gestureAtRef.current,
            ),
          });
          try {
            await audio.play();
          } catch (error) {
            if (speechRef.current === playback) {
              diagnostics.record(
                "speech.play.rejected",
                { ...playbackDiagnostics(audio), error },
                true,
              );
              speechDiagnosticsRef.current = null;
              stopSpeaking();
              throw error;
            }
          }
        } catch (err) {
          if (speechDiagnostics && speechStage !== "playback") {
            speechDiagnostics.record(
              "speech.request.failed",
              { stage: speechStage, error: err },
              true,
            );
          }
          if (!mountedRef.current) return;
          if (pendingId && requestUserId)
            dispatchChat({ type: "failed", userId: requestUserId, pendingId });
          setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
          busyRef.current = false;
          if (mountedRef.current) setLoading(false);
        }
      };

      recorder.start();
      setRecording(true);
    } catch {
      busyRef.current = false;
      setError("Microphone access failed. Check permissions.");
    }
  }

  function stopRecording() {
    gestureAtRef.current = performance.now();
    recorderRef.current?.stop();
    setRecording(false);
  }

  const hasMessages = chat.messages.length > 0;
  const recordingButton = (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
      <button
        onClick={recording ? stopRecording : startRecording}
        disabled={
          loading || isSpeaking || historyLoading || authStatus === "loading"
        }
        className="rounded-full bg-blue-600 px-8 py-4 text-white disabled:opacity-50"
      >
        {isSpeaking
          ? "Speaking..."
          : loading
            ? "Thinking..."
            : recording
              ? "Stop Recording"
              : "Start Recording"}
      </button>
      {isSpeaking && (
        <button
          type="button"
          onClick={stopSpeaking}
          className="rounded-full border border-zinc-400 px-6 py-4 font-medium transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:hover:bg-white/10"
        >
          Stop speaking
        </button>
      )}
    </div>
  );
  const feedback = (
    <>
      {historyLoading && (
        <p role="status" className="text-sm text-zinc-500">
          Restoring your conversation…
        </p>
      )}
      {historyError && (
        <div role="alert" className="text-center text-sm text-red-500">
          <p>{historyError}</p>
          <button
            onClick={() => setRestoreAttempt((value) => value + 1)}
            disabled={loading || recording}
            className="mt-2 underline underline-offset-4 disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-red-500">
          {error}
        </p>
      )}
    </>
  );

  return (
    <div
      className={
        hasMessages
          ? "flex h-dvh min-h-0 flex-col overflow-hidden"
          : "flex min-h-screen flex-col"
      }
      style={{
        backgroundColor: "light-dark(#ffffff, #202124)",
        colorScheme: "light dark",
      }}
    >
      <header className="relative z-10 flex shrink-0 items-start justify-between p-6">
        <Sidebar />
        {hasMessages && (
          <Link href="/home" className="text-xl font-bold">
            Spact
          </Link>
        )}
        {authStatus === "authenticated" && <LogoutButton />}
        {authStatus === "unauthenticated" && (
          <Link
            href="/login"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Log in
          </Link>
        )}
      </header>
      {hasMessages ? (
        <main className="flex min-h-0 flex-1 flex-col">
          <ConversationMessages messages={chat.messages} />
          <div
            className="flex shrink-0 flex-col items-center gap-2 border-t border-zinc-200 px-5 pt-2 dark:border-zinc-700"
            style={{
              paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
            }}
          >
            {feedback}
            {recordingButton}
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 pb-28 leading-snug">
          <h1 className="text-4xl font-bold">
            <Link
              href="/home"
              className="rounded focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              Spact
            </Link>
          </h1>
          <p>Say it, Remember it.</p>
          {recordingButton}
          {feedback}
        </main>
      )}
    </div>
  );
}
