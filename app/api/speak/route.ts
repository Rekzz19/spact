import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { safeDiagnosticString } from "@/lib/diagnostics/events";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";

export async function POST(request: Request) {
  const suppliedId = request.headers.get("x-spact-speech-id");
  const attemptId =
    suppliedId && /^[0-9a-f-]{36}$/i.test(suppliedId)
      ? suppliedId
      : randomUUID();
  const startedAt = performance.now();
  const log = (
    event: string,
    fields: Record<string, unknown> = {},
    failed = false,
  ) => {
    const entry = JSON.stringify({
      source: "spact.server",
      event,
      attemptId,
      elapsedMs: Math.round(performance.now() - startedAt),
      deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
      ...fields,
    });
    if (failed) console.error(entry);
    else console.info(entry);
  };
  log("speech.request.started");
  try {
    const { AiRes } = await request.json();

    if (typeof AiRes !== "string" || !AiRes.trim()) {
      return NextResponse.json(
        { error: "Speech text is required" },
        { status: 400, headers: { "X-Spact-Speech-Id": attemptId } },
      );
    }
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      log("speech.request.unauthorised", {}, true);
      return NextResponse.json(
        { error: "Unauthorised" },
        { status: 401, headers: { "X-Spact-Speech-Id": attemptId } },
      );
    }

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

    log(
      "deepgram.response",
      {
        status: response.status,
        mimeType: response.headers.get("Content-Type"),
        deepgramRequestId: safeDiagnosticString(
          response.headers.get("dg-request-id") || "",
          100,
        ),
        contentLength: response.headers.get("Content-Length"),
      },
      !response.ok,
    );
    if (!response.ok) {
      return NextResponse.json(
        { error: "Speech generation failed" },
        { status: 502, headers: { "X-Spact-Speech-Id": attemptId } },
      );
    }
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
        "X-Spact-Speech-Id": attemptId,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    log(
      "speech.request.failed",
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage:
          error instanceof Error
            ? safeDiagnosticString(error.message)
            : "Unknown failure",
      },
      true,
    );
    return NextResponse.json(
      { error: "Speech generation failed" },
      { status: 502, headers: { "X-Spact-Speech-Id": attemptId } },
    );
  }
}
