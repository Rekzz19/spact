import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/notes/route";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { expectJson, supabaseMock } from "../helpers";

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("GET /api/notes", () => {
  let db: ReturnType<typeof supabaseMock>;
  beforeEach(() => {
    db = supabaseMock();
    db.order.mockResolvedValue({ data: [], error: null });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      db as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
  });

  it("lists only the current user's note titles, newest first", async () => {
    const notes = [{ id: "note-1", title: "Osmosis" }];
    db.order.mockResolvedValue({ data: notes, error: null });
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expectJson(response, 200, { notes });
    expect(db.from).toHaveBeenCalledWith("notes");
    expect(db.select).toHaveBeenCalledWith("id, title");
    expect(db.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(db.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns an empty list for a user with no notes", async () => {
    await expectJson(await GET(), 200, { notes: [] });
  });

  it("rejects requests without a session before querying notes", async () => {
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expectJson(await GET(), 401, { error: "Unauthorised" });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("reports query failures", async () => {
    db.order.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expectJson(await GET(), 500, { error: "Failed to load notes" });
  });
});
