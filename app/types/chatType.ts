export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * user table | chat table
 * later we can have things like pricing
 *
 */

import { NextResponse } from "next/server";
import { nebius } from "@/lib/ai/nebius";
//import type { ChatMessage } from "@/types/chat";

const SYSTEM_PROMPT = `
You are Spact, a friendly voice-first
daily productivity companion.

Help users plan their day and discuss goals.
Remember the context of previous messages.
Ask one question at a time.
Keep responses concise and conversational.

Do not claim to have saved or completed a
task unless the backend actually did so.
`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transcript, history } = body;

    if (
      typeof transcript !== "string" ||
      !transcript.trim() ||
      transcript.length > 5000 ||
      !Array.isArray(history)
    ) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const validHistory = history.every(
      (message: ChatMessage) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.length <= 5000,
    );

    if (!validHistory || history.length > 20) {
      return NextResponse.json(
        { error: "Invalid conversation history" },
        { status: 400 },
      );
    }

    const completion = await nebius.chat.completions.create({
      model: process.env.NEBIUS_MODEL!,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: transcript },
      ],
      max_tokens: 250,
    });

    const reply = completion.choices[0]?.message?.content;

    if (!reply) {
      throw new Error("Empty response from Nebius");
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);

    return NextResponse.json(
      { error: "Could not process conversation" },
      { status: 502 },
    );
  }
}
