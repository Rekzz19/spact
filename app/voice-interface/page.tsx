"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import LogoutButton from "@/app/components/LogoutButton";
import Sidebar from "../components/Sidebar";

export default function Home() {
  const recorderRef = useRef<MediaRecorder | null>(null); //understand ref, why ref?
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const conversationIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const [authStatus, setAuthStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  // Checking the session never creates an anonymous account.
  useEffect(() => {
    let cancelled = false;
    async function initialiseUser() {
      //check for session
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          cache: "no-store",
        });
        if (cancelled) return;
        if (response.status === 401) {
          setAuthStatus("unauthenticated");
          return;
        }
        if (!response.ok) throw new Error("Session check failed");

        //when there is a session
        const session = await response.json();
        if (cancelled) return;
        userIdRef.current = session.authenticated ? session.userId : null;
        setAuthStatus(
          session.authenticated && !session.anonymous
            ? "authenticated"
            : "unauthenticated",
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Session check failed");
        setAuthStatus("unauthenticated");
      }
    }
    void initialiseUser();
    return () => {
      cancelled = true;
    };
  }, []);

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
      userIdRef.current = user.userId; //stored the id why? - is this safe?
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
      setTranscript("");

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

        //api sending the audio data
        try {
          await initialiseConversation();

          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Transcription failed");
          }

          setTranscript(data.transcript);

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

          if (!chatResponse.ok) {
            throw new Error("Nebius request failed");
          }

          const chatData = await chatResponse.json();
          setAiResponse(chatData.reply);
          console.log(chatData.reply);

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
          setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
          setLoading(false);
        }
      };

      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access failed. Check permissions.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-start justify-between p-6">
        <Sidebar />
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
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-4xl font-bold">Spact</h1>
        <p>Say it, do it.</p>

        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={loading || authStatus === "loading"}
          className="rounded-full bg-blue-600 px-8 py-4 text-white disabled:opacity-50"
        >
          {loading
            ? "Transcribing..."
            : recording
              ? "Stop Recording"
              : "Start Recording"}
        </button>

        {transcript && (
          <div className="max-w-lg rounded-lg border p-4">
            <h2 className="font-semibold">Transcript</h2>
            <p>{transcript}</p>
          </div>
        )}

        {aiResponse && (
          <div className="max-w-lg rounded-lg border p-4">
            <h2 className="font-semibold">Spact</h2>
            <p>{aiResponse}</p>
          </div>
        )}

        {error && <p className="text-red-500">{error}</p>}
      </main>
    </div>
  );
}
