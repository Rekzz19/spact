"use client";

import { useRef, useState, useEffect } from "react";
import LogoutButton from "@/app/components/LogoutButton";

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
  const [sessionReady, setSessionReady] = useState(false);

  //anonymous user for dev
  async function initialiseUser() {
    const response = await fetch("/api/auth/anonymous", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to initialise user");
    }

    return response.json();
  }

  async function initialiseConversation() {
    const existingId = sessionStorage.getItem("conversationId");

    if (existingId) {
      return existingId;
    }

    const response = await fetch("/api/superbase-conversations", {
      //create convos id
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to create conversation");
    }

    const data = await response.json();

    sessionStorage.setItem("conversationId", data.conversationId);

    return data.conversationId as string;
  }

  //this runs the conversation creation when we come to the chat and checks user is authenticated
  useEffect(() => {
    async function init() {
      try {
        // Step 1: Authenticate user
        await initialiseUser();

        // Step 2: Get or create conversation
        const conversationId = await initialiseConversation();

        conversationIdRef.current = conversationId;

        setSessionReady(true);
      } catch (error) {
        console.error("Initialisation failed:", error);
      }
    }

    init();
  }, []);

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
      <header className="flex justify-end p-6">
        <LogoutButton />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-4xl font-bold">Spact</h1>
        <p>Say it, do it.</p>

        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={loading}
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
