import { NextRequest, NextResponse } from "next/server";

//export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio"); //get the audio sent to the backend
    const apiKey = process.env.SPACT_DEEPGRAM_API_KEY;

    if (!(audio instanceof File)) {
      //checks the audio is a file
      return NextResponse.json(
        { error: "Audio file missing" },
        { status: 400 },
      );
    }

    if (!audio.size || audio.size > 10 * 1024 * 1024) {
      //check that file size is within a constraint
      return NextResponse.json(
        { error: "Audio must be between 1 byte and 10 MB" },
        { status: 400 },
      );
    }

    if (!apiKey) {
      //validation for api key
      return NextResponse.json(
        { error: "Deepgram API key not configured" },
        { status: 500 },
      );
    }

    const response = await fetch(
      //send request to the deepgram api using the token
      "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": audio.type || "application/octet-stream",
        },
        body: await audio.arrayBuffer(),
      },
    );

    if (!response.ok) {
      console.error("Deepgram error:", response.status);
      return NextResponse.json(
        { error: "Deepgram transcription failed" },
        { status: 502 },
      );
    }

    const data = await response.json();

    const transcript =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Transcription error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
/**
 * Need some auth, rate limiting and audio validation.
 * first commit here
 * next sending the result to the ai model,
 * getting a response, using the response to create schedule,
 * sending alarms/notifications.
 *
 * TEST TRANSCRIPTION AND COMMIT.
 */
