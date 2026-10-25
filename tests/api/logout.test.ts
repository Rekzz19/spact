import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { POST } from "@/app/api/auth/logout/route";
import { expectJson } from "../helpers";

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("POST /api/auth/logout", () => {
  const signOut = vi.fn();
  beforeEach(() => {
    signOut.mockReset().mockResolvedValue({ error: null });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { signOut },
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  });

  it("signs out the current session without logging out other devices", async () => {
    await expectJson(await POST(), 200, {
      success: true,
      message: "Logged out successfully",
    });
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("reports sign-out errors without exposing provider details", async () => {
    signOut.mockResolvedValue({
      error: { message: "private provider details" },
    });
    await expectJson(await POST(), 500, { error: "Failed to log out" });
  });

  it("handles rejected sign-out calls", async () => {
    signOut.mockRejectedValue(new Error("offline"));
    await expectJson(await POST(), 500, { error: "Internal server error" });
  });

  it("handles client initialization failure", async () => {
    vi.mocked(createSupabaseServerClient).mockRejectedValue(
      new Error("configuration missing"),
    );
    await expectJson(await POST(), 500, { error: "Internal server error" });
    expect(signOut).not.toHaveBeenCalled();
  });
});
