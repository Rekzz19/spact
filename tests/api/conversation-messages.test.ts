import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/conversations/[id]/messages/route";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { expectJson } from "../helpers";

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const conversationId = "f0a1b2c3-d4e5-4678-9abc-def012345678";
const verifiedUser = {
  id: "user-1",
  email: "person@example.com",
  email_confirmed_at: "2026-10-28T10:00:00Z",
  is_anonymous: false,
};
const getUser = vi.fn();
const maybeSingle = vi.fn();
const range = vi.fn();
const conversationQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle };
const messageQuery = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range };
const from = vi.fn();
const request = (id = conversationId, activeOnly = false) =>
  GET(
    new Request(
      `http://localhost/api/conversations/${id}/messages${activeOnly ? "?activeOnly=true" : ""}`,
    ),
    {
      params: Promise.resolve({ id }),
    },
  );

describe("GET /api/conversations/[id]/messages", () => {
  beforeEach(() => {
    getUser
      .mockReset()
      .mockResolvedValue({ data: { user: verifiedUser }, error: null });
    maybeSingle
      .mockReset()
      .mockResolvedValue({ data: { id: conversationId }, error: null });
    range.mockReset().mockResolvedValue({ data: [], error: null });
    conversationQuery.select.mockReturnValue(conversationQuery);
    conversationQuery.eq.mockReturnValue(conversationQuery);
    messageQuery.select.mockReturnValue(messageQuery);
    messageQuery.eq.mockReturnValue(messageQuery);
    messageQuery.order.mockReturnValue(messageQuery);
    from.mockImplementation((table) =>
      table === "conversations" ? conversationQuery : messageQuery,
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser },
      from,
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  });

  it("checks ownership and returns the requested message fields oldest first", async () => {
    const messages = [
      {
        id: 1,
        role: "user",
        content: "Hello",
        created_at: "2026-10-28T10:00:00Z",
      },
      {
        id: 2,
        role: "assistant",
        content: "What are we revising?",
        created_at: "2026-10-28T10:01:00Z",
      },
    ];
    range.mockResolvedValueOnce({ data: messages, error: null });
    const response = await request();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expectJson(response, 200, { messages });
    expect(conversationQuery.eq).toHaveBeenCalledWith("id", conversationId);
    expect(conversationQuery.eq).toHaveBeenCalledWith(
      "user_id",
      verifiedUser.id,
    );
    expect(messageQuery.select).toHaveBeenCalledWith(
      "id, role, content, created_at",
    );
    expect(messageQuery.eq).toHaveBeenCalledWith(
      "conversation_id",
      conversationId,
    );
    expect(messageQuery.order.mock.calls).toEqual([
      ["created_at", { ascending: true }],
      ["id", { ascending: true }],
      ["created_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
    expect(maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(
      range.mock.invocationCallOrder[0],
    );
  });

  it("returns an empty array for an owned conversation with no messages", async () => {
    await expectJson(await request(), 200, { messages: [] });
  });

  it("collects subsequent batches even when the server caps results below 1000", async () => {
    range
      .mockResolvedValueOnce({ data: [{ id: 1 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 2 }], error: null });
    await expectJson(await request(), 200, {
      messages: [{ id: 1 }, { id: 2 }],
    });
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1, 1000],
      [2, 1001],
    ]);
  });

  it.each(["", "bad-id", "-1", "0", "1.5", "9223372036854775808", "1 or 1=1"])(
    "rejects invalid IDs (%s) before querying",
    async (id) => {
      await expectJson(await request(id), 400, {
        error: "Invalid conversation ID",
      });
      expect(from).not.toHaveBeenCalled();
    },
  );

  it("supports integer conversation IDs", async () => {
    await expectJson(await request("123"), 200, { messages: [] });
    expect(conversationQuery.eq).toHaveBeenCalledWith("id", "123");
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: verifiedUser }, error: { message: "Invalid session" } },
  ])("rejects unauthenticated requests (%j)", async (result) => {
    getUser.mockResolvedValue(result);
    await expectJson(await request(), 401, { error: "Unauthorised" });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    {
      ...verifiedUser,
      is_anonymous: true,
      email: null,
      email_confirmed_at: null,
    },
    { ...verifiedUser, email_confirmed_at: null },
    { ...verifiedUser, email: null },
  ])(
    "allows authenticated users without requiring a verified email (%j)",
    async (user) => {
      getUser.mockResolvedValue({ data: { user }, error: null });
      await expectJson(await request(), 200, { messages: [] });
      expect(conversationQuery.eq).toHaveBeenCalledWith("user_id", user.id);
    },
  );

  it("does not query messages when a conversation is missing or belongs to another user", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expectJson(await request(), 404, {
      error: "Conversation not found or access denied",
    });
    expect(from).not.toHaveBeenCalledWith("messages");
  });

  it("handles database ID format errors", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: "22P02" } });
    await expectJson(await request(), 400, {
      error: "Invalid conversation ID",
    });
  });

  it("reports conversation query failures", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "Offline" },
    });
    await expectJson(await request(), 500, {
      error: "Failed to retrieve conversation",
    });
    expect(range).not.toHaveBeenCalled();
  });

  it("reports message query failures without returning partial history", async () => {
    range
      .mockResolvedValueOnce({ data: [{ id: 1 }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Offline" } });
    await expectJson(await request(), 500, {
      error: "Failed to retrieve messages",
    });
  });

  it("handles unexpected client errors", async () => {
    vi.mocked(createSupabaseServerClient).mockRejectedValue(
      new Error("Offline"),
    );
    await expectJson(await request(), 500, { error: "Internal server error" });
  });
});

describe("Read-only conversation restoration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
    maybeSingle.mockResolvedValue({
      data: { id: conversationId },
      error: null,
    });
    range.mockReset().mockResolvedValue({ data: [], error: null });
    conversationQuery.select.mockReturnValue(conversationQuery);
    conversationQuery.eq.mockReturnValue(conversationQuery);
    messageQuery.select.mockReturnValue(messageQuery);
    messageQuery.eq.mockReturnValue(messageQuery);
    messageQuery.order.mockReturnValue(messageQuery);
    from.mockImplementation((table) =>
      table === "conversations" ? conversationQuery : messageQuery,
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser },
      from,
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  });
  afterEach(() => vi.useRealTimers());

  it.each([30, 91])(
    "restores anonymous history using the same inactivity rule (%s minutes)",
    async (minutesAgo) => {
      const guest = {
        id: "guest-1",
        is_anonymous: true,
        email: null,
        email_confirmed_at: null,
      };
      getUser.mockResolvedValue({ data: { user: guest }, error: null });
      const messages = [
        {
          id: 1,
          role: "user",
          content: "Guest revision",
          created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
        },
      ];
      range.mockResolvedValueOnce({ data: messages, error: null });
      const active = minutesAgo < 90;
      await expectJson(await request(conversationId, true), 200, {
        messages: active ? messages : [],
        active,
        userId: guest.id,
      });
      expect(conversationQuery.eq).toHaveBeenCalledWith("user_id", guest.id);
    },
  );

  it("does not let an anonymous user retrieve another user's conversation", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "guest-1", is_anonymous: true } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expectJson(await request(conversationId, true), 404, {
      error: "Conversation not found or access denied",
    });
    expect(conversationQuery.eq).toHaveBeenCalledWith("user_id", "guest-1");
    expect(from).not.toHaveBeenCalledWith("messages");
  });

  it.each([30, 89.99, 90, 91])(
    "restores only messages within the inactivity limit (%s minutes)",
    async (minutesAgo) => {
      const messages = [
        {
          id: 1,
          role: "user",
          content: "Revision",
          created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
        },
      ];
      range.mockResolvedValueOnce({ data: messages, error: null });
      const active = minutesAgo < 90;
      await expectJson(await request(conversationId, true), 200, {
        messages: active ? messages : [],
        active,
        userId: verifiedUser.id,
      });
      expect(
        from.mock.calls.every(
          ([table]) => table === "messages" || table === "conversations",
        ),
      ).toBe(true);
      // Query mocks expose no insert/update/delete: restoration cannot create a conversation.
    },
  );

  it("keeps an empty conversation reusable without writing to the database", async () => {
    await expectJson(await request(conversationId, true), 200, {
      messages: [],
      active: true,
      userId: verifiedUser.id,
    });
  });

  it("uses the latest message rather than the start time of a long revision session", async () => {
    const messages = [
      { id: 1, created_at: "2026-10-28T08:00:00Z" },
      { id: 2, created_at: "2026-10-28T11:55:00Z" },
    ];
    range.mockResolvedValueOnce({ data: messages, error: null });
    await expectJson(await request(conversationId, true), 200, {
      messages,
      active: true,
      userId: verifiedUser.id,
    });
  });

  it("fails safely on invalid activity timestamps", async () => {
    range.mockResolvedValueOnce({
      data: [{ id: 1, created_at: "invalid" }],
      error: null,
    });
    await expectJson(await request(conversationId, true), 500, {
      error: "Invalid conversation activity timestamp",
    });
  });
});
