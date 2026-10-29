import { beforeEach, describe, expect, it, vi } from "vitest";
import { knownIssue } from "../known-issues";
import { POST } from "@/app/api/notes/route";
import { saveNote } from "@/lib/notes/notes";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { expectJson, jsonRequest } from "../helpers";

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
const getUser = vi.fn();
const ownership = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
const saved = vi.fn();
const insert = vi.fn();
const from = vi.fn();
const note = {
  id: "note-1",
  title: "Osmosis",
  content: "Water movement",
  created_at: "2026-10-28T12:00:00Z",
};
const request = (
  body: unknown = {
    title: " Osmosis ",
    content: " Water movement ",
    conversationId: "conversation-1",
  },
) => POST(jsonRequest("notes", body));
const client = () =>
  ({ auth: { getUser }, from }) as unknown as Awaited<
    ReturnType<typeof createSupabaseServerClient>
  >;

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  ownership.select.mockReturnValue(ownership);
  ownership.eq.mockReturnValue(ownership);
  ownership.single.mockResolvedValue({
    data: { id: "conversation-1" },
    error: null,
  });
  saved.mockResolvedValue({ data: note, error: null });
  insert.mockReturnValue({ select: () => ({ single: saved }) });
  from.mockImplementation((table) =>
    table === "conversations" ? ownership : { insert },
  );
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client());
});

describe("Note writing with mocked Supabase, real route and saveNote", () => {
  it("checks ownership and saves trimmed fields under the session user ID", async () => {
    await expectJson(await request(), 201, { note });
    expect(ownership.eq).toHaveBeenCalledWith("id", "conversation-1");
    expect(ownership.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(ownership.single.mock.invocationCallOrder[0]).toBeLessThan(
      insert.mock.invocationCallOrder[0],
    );
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      conversation_id: "conversation-1",
      title: "Osmosis",
      content: "Water movement",
    });
  });
  it("allows an authenticated anonymous user to save a note without a conversation", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "guest-1", is_anonymous: true } },
      error: null,
    });
    await expectJson(
      await request({ title: "Osmosis", content: "Water movement" }),
      201,
      { note },
    );
    expect(insert).toHaveBeenCalledWith({
      user_id: "guest-1",
      conversation_id: null,
      title: "Osmosis",
      content: "Water movement",
    });
    expect(ownership.single).not.toHaveBeenCalled();
  });
  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: "user-1" } }, error: { message: "Invalid token" } },
  ])(
    "rejects unauthorised writes before any database access (%j)",
    async (session) => {
      getUser.mockResolvedValue(session);
      await expectJson(await request(), 401, { error: "Unauthorised" });
      expect(from).not.toHaveBeenCalled();
    },
  );
  it("never inserts notes into another student's conversation", async () => {
    ownership.single.mockResolvedValue({ data: null, error: null });
    expect((await request()).status).not.toBe(201);
    expect(insert).not.toHaveBeenCalled();
  });
  it("reports insert failures without confirming a save", async () => {
    saved.mockResolvedValue({ data: null, error: { message: "Write failed" } });
    await expectJson(await request(), 500, { error: "Internal server error" });
  });
  it.each([
    { caseName: "empty title", title: "", content: "body" },
    { caseName: "blank body", title: "title", content: " " },
    { caseName: "non-string title", title: 123, content: "body" },
    {
      caseName: "title over 200 characters",
      title: "x".repeat(201),
      content: "body",
    },
    {
      caseName: "body over 20000 characters",
      title: "title",
      content: "x".repeat(20001),
    },
  ])("validates $caseName before accessing the database", async (fields) => {
    await expect(
      saveNote({
        supabase: client(),
        userId: "user-1",
        ...fields,
      } as Parameters<typeof saveNote>[0]),
    ).rejects.toThrow("Invalid note title or content");
    expect(from).not.toHaveBeenCalled();
  });
  knownIssue(
    "[known defect] invalid note fields should return 400 rather than 500",
    async () => {
      expect((await request({ title: "", content: "body" })).status).toBe(400);
    },
  );
});
