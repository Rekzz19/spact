import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { AiRes } = await request.json();

    const response = await fetch(
      "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.SPACT_DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: AiRes }),
      },
    );

    if (!response.ok) {
      console.error(
        "Deepgram TTS error:",
        response.status,
        await response.text(),
      );
      return NextResponse.json(
        { error: "Speech generation failed" },
        { status: 502 },
      );
    }
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
      },
    });
  } catch (error) {
    console.error("Speech failed", error);
    return NextResponse.json(
      { error: "Speech generation failed" },
      { status: 502 },
    );
  }
}
/**
 * Think you need history for context => database?
 * Faster responses possibly??
 * create tasks
 */
