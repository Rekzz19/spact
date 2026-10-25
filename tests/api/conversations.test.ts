import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { POST } from "@/app/api/superbase-conversations/route";
import { expectJson, supabaseMock } from "../helpers";

vi.mock("@/lib/superbase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("POST /api/superbase-conversations", () => {
  let db: ReturnType<typeof supabaseMock>;
  beforeEach(() => {
    db = supabaseMock();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      db as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
  });

  it("creates a conversation for the authenticated user", async () => {
    await expectJson(await POST(), 201, { conversationId: "conversation-1" });
    expect(db.from).toHaveBeenCalledWith("conversations");
    expect(db.insert).toHaveBeenCalledWith({ user_id: "user-1" });
    expect(db.insertedSelect).toHaveBeenCalledWith("id");
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: "user-1" } }, error: { message: "Invalid session" } },
  ])("rejects unauthenticated requests (%j)", async (result) => {
    db.auth.getUser.mockResolvedValue(result);
    await expectJson(await POST(), 401, { error: "Unauthorised" });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("returns 500 when inserting a conversation fails", async () => {
    db.single.mockResolvedValue({
      data: null,
      error: { message: "Database unavailable" },
    });
    await expectJson(await POST(), 500, {
      error: "Failed to create conversation",
    });
  });

  it("handles unexpected client failures", async () => {
    vi.mocked(createSupabaseServerClient).mockRejectedValue(
      new Error("offline"),
    );
    await expectJson(await POST(), 500, { error: "Internal server error" });
  });
});
