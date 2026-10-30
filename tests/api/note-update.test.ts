import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/notes/[id]/route";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
const id = "11111111-1111-4111-8111-111111111111";
const getUser = vi.fn();
const query = { eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() };
const update = vi.fn();
const from = vi.fn();
const request = (
  body: unknown = { title: " Edited title ", content: "Updated\nbody" },
  noteId = id,
) =>
  PATCH(
    new Request("http://localhost/api/notes/" + noteId, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: noteId }) },
  );

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({
    data: { id, title: "Edited title", content: "Updated\nbody" },
    error: null,
  });
  update.mockReturnValue(query);
  from.mockReturnValue({ update });
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser },
    from,
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
});

describe("PATCH /api/notes/[id] (mocked Supabase, RLS client preserved)", () => {
  it("updates only the title and content of a note owned by the session user", async () => {
    const response = await request({
      title: " Edited title ",
      content: "Updated\nbody",
      user_id: "attacker",
      conversation_id: "other",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).note.id).toBe(id);
    expect(from).toHaveBeenCalledWith("notes");
    expect(update).toHaveBeenCalledWith({
      title: "Edited title",
      content: "Updated\nbody",
    });
    expect(query.eq).toHaveBeenCalledWith("id", id);
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
  it("allows authenticated anonymous users to edit their notes", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "guest-1", is_anonymous: true } },
      error: null,
    });
    expect((await request()).status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("user_id", "guest-1");
  });
  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: "user-1" } }, error: { message: "Expired" } },
  ])("rejects invalid sessions before updating (%j)", async (result) => {
    getUser.mockResolvedValue(result);
    expect((await request()).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });
  it("does not disclose missing or other-user notes", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await request()).status).toBe(404);
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
  it.each(["invalid", "-1", "0", "9223372036854775808"])(
    "rejects malformed note IDs (%s)",
    async (noteId) => {
      expect((await request(undefined, noteId)).status).toBe(400);
      expect(update).not.toHaveBeenCalled();
    },
  );
  it.each([
    { title: "", content: "body" },
    { title: " ", content: "body" },
    { title: 1, content: "body" },
    { title: "title", content: null },
    null,
    { title: "a".repeat(201), content: "body" },
    { title: "title", content: "a".repeat(20001) },
  ])("rejects invalid fields without updating (case %#)", async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
  it("allows clearing the body and preserves whitespace", async () => {
    expect((await request({ title: "Title", content: "" })).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ title: "Title", content: "" });
    await request({ title: "Title", content: "\n  spaced  \n" });
    expect(update).toHaveBeenLastCalledWith({
      title: "Title",
      content: "\n  spaced  \n",
    });
  });
  it("handles malformed JSON", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/notes/" + id, {
        method: "PATCH",
        body: "{",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
  it("returns a safe server error when saving fails", async () => {
    query.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "Private database details" },
    });
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("Private database details");
  });
});
