import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { POST } from "@/app/api/auth/anonymous/route";
import { expectJson, supabaseMock } from "../helpers";

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("POST /api/auth/anonymous", () => {
  let db: ReturnType<typeof supabaseMock>;
  beforeEach(() => {
    db = supabaseMock();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      db as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
  });

  it("reuses the current identity without creating an anonymous account", async () => {
    await expectJson(await POST(), 200, { userId: "user-1", existing: true });
    expect(db.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it.each([null, { status: 400 }])(
    "creates an anonymous identity when there is no session (%j)",
    async (error) => {
      db.auth.getUser.mockResolvedValue({ data: { user: null }, error });
      db.auth.signInAnonymously.mockResolvedValue({
        data: { user: { id: "anonymous-1" } },
        error: null,
      });
      await expectJson(await POST(), 200, {
        userId: "anonymous-1",
        existing: false,
      });
      expect(db.auth.signInAnonymously).toHaveBeenCalledOnce();
    },
  );

  it("does not replace an identity when session verification fails", async () => {
    db.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 503 },
    });
    await expectJson(await POST(), 401, { error: "Could not verify session" });
    expect(db.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it.each([
    [{ message: "Anonymous sign-in disabled" }, "Anonymous sign-in disabled"],
    [null, "Authentication failed"],
  ])("handles anonymous sign-in failure (%j)", async (error, message) => {
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    db.auth.signInAnonymously.mockResolvedValue({
      data: { user: null },
      error,
    });
    await expectJson(await POST(), 500, { error: message });
  });
});
