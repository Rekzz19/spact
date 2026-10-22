import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/speak/route";
import { expectJson, jsonRequest } from "../helpers";

describe("POST /api/speak", () => {
  beforeEach(() => vi.stubEnv("SPACT_DEEPGRAM_API_KEY", "test-deepgram"));

  it("sends text and returns readable audio bytes with the provider content type", async () => {
    const bytes = new Uint8Array([73, 68, 51, 0, 255]);
    vi.mocked(fetch).mockResolvedValue(
      new Response(bytes, { headers: { "Content-Type": "audio/wav" } }),
    );
    const response = await POST(jsonRequest("speak", { AiRes: "Hello" }));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/v1/speak?"), {
      method: "POST",
      headers: {
        Authorization: "Token test-deepgram",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "Hello" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/wav");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("defaults to audio/mpeg if the provider omits its content type", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2])));
    expect(
      (await POST(jsonRequest("speak", { AiRes: "Hello" }))).headers.get(
        "Content-Type",
      ),
    ).toBe("audio/mpeg");
  });

  it("returns a safe error for provider rejection", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("Provider details", { status: 403 }),
    );
    await expectJson(
      await POST(jsonRequest("speak", { AiRes: "Hello" })),
      502,
      { error: "Speech generation failed" },
    );
  });

  it("handles network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    await expectJson(
      await POST(jsonRequest("speak", { AiRes: "Hello" })),
      502,
      { error: "Speech generation failed" },
    );
  });

  it("handles invalid JSON without contacting Deepgram", async () => {
    await expectJson(
      await POST(
        new Request("http://localhost/api/speak", {
          method: "POST",
          body: "{",
        }),
      ),
      502,
      { error: "Speech generation failed" },
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
