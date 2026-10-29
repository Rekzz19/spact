import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/diagnostics/route";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { jsonRequest } from "../helpers";

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
const getUser = vi.fn();
const attemptId = "11111111-1111-4111-8111-111111111111";
const payload = {
  attemptId,
  userAgent: "iPhone Safari",
  events: [
    {
      event: "speech.play.rejected",
      errorName: "NotAllowedError",
      errorMessage: "Playback denied",
      bytes: 1024,
      userActive: false,
    },
  ],
};
beforeEach(() => {
  getUser.mockResolvedValue({
    data: { user: { id: "guest-1", is_anonymous: true } },
    error: null,
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser },
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
});
describe("Production browser diagnostic endpoint (mocked session)", () => {
  it("logs correlated browser observations for authenticated anonymous users", async () => {
    expect((await POST(jsonRequest("diagnostics", payload))).status).toBe(204);
    expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0])).toMatchObject({
      source: "spact.browser",
      attemptId,
      userAgent: "iPhone Safari",
      events: payload.events,
    });
  });
  it("drops unknown fields and strips URLs/control characters", async () => {
    await POST(
      jsonRequest("diagnostics", {
        ...payload,
        transcript: "private",
        events: [
          {
            ...payload.events[0],
            content: "secret response",
            errorMessage: "Denied\nhttps://example.com/token?secret=abc",
          },
        ],
      }),
    );
    const logged = String(vi.mocked(console.info).mock.calls[0][0]);
    expect(logged).not.toContain("secret response");
    expect(logged).not.toContain("private");
    expect(logged).not.toContain("secret=abc");
    expect(JSON.parse(logged).events[0].errorMessage).toBe("Denied [url]");
  });
  it("rejects unauthenticated reports without logging", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(jsonRequest("diagnostics", payload))).status).toBe(401);
    expect(console.info).not.toHaveBeenCalled();
  });
  it("rejects cross-origin reports", async () => {
    const request = jsonRequest("diagnostics", payload);
    request.headers.set("origin", "https://another-site.example");
    expect((await POST(request)).status).toBe(403);
    expect(console.info).not.toHaveBeenCalled();
  });
  it("reports collection infrastructure failures as server errors", async () => {
    vi.mocked(createSupabaseServerClient).mockRejectedValueOnce(
      new Error("Unavailable"),
    );
    expect((await POST(jsonRequest("diagnostics", payload))).status).toBe(500);
    expect(console.info).not.toHaveBeenCalled();
  });
  it.each([
    { ...payload, attemptId: "bad" },
    { ...payload, events: [{ event: "arbitrary" }] },
    { ...payload, events: [] },
    { ...payload, events: Array(13).fill(payload.events[0]) },
  ])("rejects invalid or excessive event batches (%j)", async (body) => {
    expect((await POST(jsonRequest("diagnostics", body))).status).toBe(400);
    expect(console.info).not.toHaveBeenCalled();
  });
  it("bounds the request body", async () => {
    expect(
      (
        await POST(
          jsonRequest("diagnostics", { ...payload, extra: "x".repeat(12001) }),
        )
      ).status,
    ).toBe(413);
    expect(console.info).not.toHaveBeenCalled();
  });
});
