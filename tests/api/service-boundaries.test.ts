import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as speak } from "@/app/api/speak/route";
import { POST as transcribe } from "@/app/api/transcribe/route";
import { jsonRequest } from "../helpers";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
});

// Regression checks use mocked sessions and providers; no real service is contacted.
describe("Speech API access and input validation", () => {
  it("[regression] unauthenticated speech requests should not contact Deepgram", async () => {
    vi.stubEnv("SPACT_DEEPGRAM_API_KEY", "test-deepgram");
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2])));
    const response = await speak(jsonRequest("speak", { AiRes: "Hello" }));
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("[regression] unauthenticated transcription requests should not contact Deepgram", async () => {
    vi.stubEnv("SPACT_DEEPGRAM_API_KEY", "test-deepgram");
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        results: { channels: [{ alternatives: [{ transcript: "Hello" }] }] },
      }),
    );
    const form = new FormData();
    form.append(
      "audio",
      new File([new Uint8Array([1, 2])], "recording.webm", {
        type: "audio/webm",
      }),
    );
    const response = await transcribe(
      new NextRequest("http://localhost/api/transcribe", {
        method: "POST",
        body: form,
      }),
    );
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("[regression] speech requests must validate text before contacting Deepgram", async () => {
    vi.stubEnv("SPACT_DEEPGRAM_API_KEY", "test-deepgram");
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2])));
    const response = await speak(
      jsonRequest("speak", { AiRes: { unexpected: "object" } }),
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
