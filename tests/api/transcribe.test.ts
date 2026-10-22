import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/transcribe/route";
import { expectJson } from "../helpers";

function recording(size = 4, type = "audio/webm") {
  const form = new FormData();
  form.append("audio", new File([new Uint8Array(size)], "recording", { type }));
  return new NextRequest("http://localhost/api/transcribe", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/transcribe", () => {
  beforeEach(() => vi.stubEnv("SPACT_DEEPGRAM_API_KEY", "test-deepgram"));

  it("uploads the recording with authentication and returns the transcript", async () => {
    const fetch = vi.mocked(globalThis.fetch).mockResolvedValue(
      Response.json({
        results: {
          channels: [{ alternatives: [{ transcript: "Plan my day" }] }],
        },
      }),
    );
    await expectJson(await POST(recording()), 200, {
      transcript: "Plan my day",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/listen?"),
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Token test-deepgram",
          "Content-Type": "audio/webm",
        },
        body: expect.any(ArrayBuffer),
      }),
    );
    expect(new Uint8Array(fetch.mock.calls[0][1]!.body as ArrayBuffer)).toEqual(
      new Uint8Array(4),
    );
  });

  it.each([null, "not a file"])(
    "rejects missing or non-file audio: %s",
    async (audio) => {
      const form = new FormData();
      if (audio !== null) form.append("audio", audio);
      await expectJson(
        await POST(
          new NextRequest("http://localhost/api/transcribe", {
            method: "POST",
            body: form,
          }),
        ),
        400,
        { error: "Audio file missing" },
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([0, 10 * 1024 * 1024 + 1])(
    "rejects an invalid file size of %i",
    async (size) => {
      await expectJson(await POST(recording(size)), 400, {
        error: "Audio must be between 1 byte and 10 MB",
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects missing server credentials without contacting Deepgram", async () => {
    vi.stubEnv("SPACT_DEEPGRAM_API_KEY", undefined);
    await expectJson(await POST(recording()), 500, {
      error: "Deepgram API key not configured",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns an empty transcript when no alternative is available", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: {} }));
    await expectJson(await POST(recording()), 200, { transcript: "" });
  });

  it("maps provider failures to 502", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );
    await expectJson(await POST(recording()), 502, {
      error: "Deepgram transcription failed",
    });
  });

  it("handles network errors", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    await expectJson(await POST(recording()), 500, {
      error: "Internal server error",
    });
  });

  it("handles malformed multipart data", async () => {
    await expectJson(
      await POST(
        new NextRequest("http://localhost/api/transcribe", {
          method: "POST",
          body: "invalid",
        }),
      ),
      500,
      { error: "Internal server error" },
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
