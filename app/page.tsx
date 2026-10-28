"use client";

import { useRef, useState, useEffect, useReducer } from "react";
import Link from "next/link";
import LogoutButton from "@/app/components/LogoutButton";
import Sidebar from "@/app/components/Sidebar";
import ConversationMessages from "@/app/components/ConversationMessages";
import { chatReducer, emptyChat } from "@/lib/conversations/chat-state";

export default function Home() {
  const recorderRef = useRef<MediaRecorder | null>(null); //understand ref, why ref?
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
        const id = sessionStorage.getItem(storageKey);
        if (!id) return;
        conversationIdRef.current = id;
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
          const speechResponse = await fetch("/api/speak", {
            method: "POST",
            body: JSON.stringify({
              AiRes: chatData.reply,
            }),
          });
          //handle res
          if (!speechResponse.ok) {
            throw new Error("Speech generation failed");
          }

          const audioBlob = await speechResponse.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);

          audio.onended = () => URL.revokeObjectURL(audioUrl);
          //play audio
          try {
            await audio.play();
          } catch (error) {
            URL.revokeObjectURL(audioUrl);
            throw error;
          }
        } catch (err) {
          if (pendingId && requestUserId)
            dispatchChat({ type: "failed", userId: requestUserId, pendingId });
          setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
          busyRef.current = false;
          setLoading(false);
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
    recorderRef.current?.stop();
    setRecording(false);
  }

  const hasMessages = chat.messages.length > 0;
  const recordingButton = (
    <button
      onClick={recording ? stopRecording : startRecording}
      disabled={loading || historyLoading || authStatus === "loading"}
      className="mt-4 rounded-full bg-blue-600 px-8 py-4 text-white disabled:opacity-50"
    >
      {loading
        ? "Transcribing..."
        : recording
          ? "Stop Recording"
          : "Start Recording"}
    </button>
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
      <header className="flex shrink-0 items-start justify-between p-6">
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
        <main className="relative -top-10 flex flex-1 flex-col items-center justify-center gap-2 p-8 leading-snug">
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
