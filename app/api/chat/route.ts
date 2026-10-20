import { NextResponse } from "next/server";
import { nebius } from "@/lib/ai/nebius";

//export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { transcript } = await request.json();

    if (
      typeof transcript !== "string" ||
      !transcript.trim() ||
      transcript.length > 5000 //checks around the transcript length
    ) {
      return NextResponse.json(
        { error: "Invalid transcript" },
        { status: 400 },
      );
    }

    if (!process.env.SPACT_NEBIUS_API_KEY) {
      return NextResponse.json(
        { error: "Nebius API key missing" },
        { status: 500 },
      );
    }

    const completion = await nebius.chat.completions.create({
      model: "nvidia/Nemotron-3_5-Lightning",
      messages: [
        {
          role: "system",
          content: `You are Spact, a friendly voice-first
            daily productivity companion.
            Help the user clarify their goals and plans.
            Ask one question at a time.
            Keep responses short and conversational.
            Never claim to have saved a task,
            sent a reminder, or changed a schedule.`,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      max_tokens: 250,
      // Nebius-specific option passed through the OpenAI-compatible SDK.
      ...{
        chat_template_kwargs: {
          enable_thinking: false,
        },
      },
    });

    const reply = completion.choices[0]?.message?.content;
    console.log(completion.choices[0]?.finish_reason);

    if (!reply) {
      throw new Error("Empty response from Nebius");
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Nebius request failed:", error);

    return NextResponse.json(
      { error: "Could not generate an AI response" },
      { status: 502 },
    );
  }
}
