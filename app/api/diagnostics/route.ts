import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import {
  diagnosticEvents,
  numericFields,
  booleanFields,
  stringFields,
  safeDiagnosticString,
} from "@/lib/diagnostics/events";

export async function POST(request: Request) {
  let validated = false;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    // Bound the body even when Content-Length is absent or incorrect.
    const reader = request.body?.getReader();
    if (!reader)
      return NextResponse.json(
        { error: "Invalid diagnostics" },
        { status: 400 },
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12000) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Diagnostics too large" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      !body ||
      typeof body.attemptId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.attemptId) ||
      !Array.isArray(body.events) ||
      !body.events.length ||
      body.events.length > 12
    ) {
      return NextResponse.json(
        { error: "Invalid diagnostics" },
        { status: 400 },
      );
    }
    const events: Record<string, unknown>[] = [];
    for (const item of body.events) {
      if (!item || !diagnosticEvents.includes(item.event)) {
        return NextResponse.json(
          { error: "Invalid diagnostics" },
          { status: 400 },
        );
      }
      const event: Record<string, unknown> = { event: item.event };
      for (const key of numericFields)
        if (
          typeof item[key] === "number" &&
          Number.isFinite(item[key]) &&
          item[key] >= 0
        )
          event[key] = item[key];
      for (const key of booleanFields)
        if (typeof item[key] === "boolean") event[key] = item[key];
      for (const key of stringFields)
        if (typeof item[key] === "string")
          event[key] = safeDiagnosticString(item[key]);
      events.push(event);
    }
    validated = true;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    // Browser reports are untrusted client observations, not proof of provider behavior.
    console.info(
      JSON.stringify({
        source: "spact.browser",
        attemptId: body.attemptId,
        deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
        receivedAt: new Date().toISOString(),
        userAgent:
          typeof body.userAgent === "string"
            ? safeDiagnosticString(body.userAgent)
            : undefined,
        events,
      }),
    );
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    if (validated) {
      console.error(
        JSON.stringify({
          source: "spact.server",
          event: "diagnostics.collection.failed",
        }),
      );
      return NextResponse.json(
        { error: "Diagnostics unavailable" },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Invalid diagnostics" }, { status: 400 });
  }
}
