
"use client";

import { useRef, useState } from "react";

export default function Home() {
  const recorderRef = useRef<MediaRecorder | null>(null); //understand ref, why ref?
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  async function startRecording() {
    try {
      setError("");
      setTranscript("");

      const stream = await navigator.mediaDevices.getUserMedia({ //user audio input
        audio: true,
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream); //new record event
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => { //pushing the audio event data to the Blob - file like object containing raw data
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
            }),
            });

            if (!chatResponse.ok) {
                throw new Error("Nebius request failed");
            }

            const chatData = await chatResponse.json();
            setAiResponse(chatData.reply);
            console.log(chatData.reply);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "An error occurred"
          );
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
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
  );
}
