import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/chat/route";
import { nebius } from "@/lib/ai/nebius";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { jsonRequest } from "../helpers";
import { saveNote } from "@/lib/notes/notes";

vi.mock("@/lib/notes/notes", () => ({ saveNote: vi.fn() }));

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/ai/nebius", () => ({
  nebius: {
    chat: { completions: { create: vi.fn() } },
    models: { list: vi.fn().mockResolvedValue({ data: [] }) },
  },
}));

const originalId = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2026-10-28T12:00:00Z");
type StoredMessage = {
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
};
let conversations: { id: string; user_id: string }[];
let messages: StoredMessage[];
let latestError: object | null;
let ownershipError: object | null;
let creationError: object | null;
const createInsert = vi.fn();
const messageInsert = vi.fn();
const from = vi.fn();
const send = (id: string | null | undefined = originalId) =>
  POST(
    jsonRequest("chat", { transcript: "Next question", conversationId: id }),
  );
const seedMessage = (minutesAgo: number) =>
  messages.push({
    conversation_id: originalId,
    role: "user",
    content: "Earlier revision",
    created_at: new Date(now - minutesAgo * 60000).toISOString(),
  });

beforeEach(() => {
  vi.mocked(nebius.models.list).mockResolvedValue({
    data: [],
  } as unknown as Awaited<ReturnType<typeof nebius.models.list>>);
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("SPACT_NEBIUS_API_KEY", "test-key");
  conversations = [{ id: originalId, user_id: "user-1" }];
  messages = [];
  latestError = ownershipError = creationError = null;
  createInsert.mockImplementation((row) => ({
    select: () => ({
      single: async () => {
        if (creationError) return { data: null, error: creationError };
        conversations.push(row);
        return { data: { id: row.id }, error: null };
      },
    }),
  }));
  messageInsert.mockImplementation((rows) => {
    messages.push(
      ...rows.map((row: StoredMessage) => ({
        ...row,
        created_at: new Date().toISOString(),
      })),
    );
    return { error: null };
  });
  from.mockImplementation((table) => {
    if (table === "conversations")
      return {
        insert: createInsert,
        select: () => {
          const filters: Record<string, string> = {};
          const query = {
            eq: (key: string, value: string) => {
              filters[key] = value;
              return query;
            },
            maybeSingle: async () => ({
              data:
                conversations.find(
                  (row) =>
                    row.id === filters.id && row.user_id === filters.user_id,
                ) ?? null,
              error: ownershipError,
            }),
          };
          return query;
        },
      };
    return {
      insert: messageInsert,
      select: (columns: string) => {
        let id: string;
        const query = {
          eq: (_key: string, value: string) => {
            id = value;
            return query;
          },
          order: () => query,
          limit: async (count: number) => ({
            data: messages
              .filter((row) => row.conversation_id === id)
              .sort(
                (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
              )
              .slice(0, count)
              .map((row) =>
                columns === "created_at"
                  ? { created_at: row.created_at }
                  : { role: row.role, content: row.content },
              ),
            error: columns === "created_at" ? latestError : null,
          }),
        };
        return query;
      },
    };
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
    from,
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  vi.mocked(nebius.chat.completions.create).mockResolvedValue({
    choices: [{ message: { content: "Next revision question?" } }],
  } as Awaited<ReturnType<typeof nebius.chat.completions.create>>);
});
afterEach(() => vi.useRealTimers());

describe("Chat conversation inactivity", () => {
  it.each([30, 89.99])(
    "reuses a conversation active %s minutes ago",
    async (minutes) => {
      seedMessage(minutes);
      const response = await send();
      expect(response.status).toBe(200);
      expect((await response.json()).conversationId).toBe(originalId);
      expect(createInsert).not.toHaveBeenCalled();
      expect(
        messages
          .slice(-2)
          .every((message) => message.conversation_id === originalId),
      ).toBe(true);
    },
  );

  it.each([90, 91])(
    "creates a new UUID after %s minutes, preserves old messages and excludes old history",
    async (minutes) => {
      seedMessage(minutes);
      const previous = { ...messages[0] };
      const response = await send();
      expect(response.status).toBe(200);
      const { conversationId } = await response.json();
      expect(conversationId).not.toBe(originalId);
      expect(conversationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(conversations).toHaveLength(2);
      expect(conversations[0]).toEqual({ id: originalId, user_id: "user-1" });
      expect(messages[0]).toEqual(previous);
      expect(
        messages
          .slice(-2)
          .every((message) => message.conversation_id === conversationId),
      ).toBe(true);
      expect(nebius.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({ role: "system" }),
            { role: "user", content: "Next question" },
          ],
        }),
      );
    },
  );

  it("keeps an active session beyond 90 minutes by checking the latest message each time", async () => {
    seedMessage(30);
    for (let step = 0; step < 4; step++) {
      vi.setSystemTime(now + step * 60 * 60000);
      expect((await (await send()).json()).conversationId).toBe(originalId);
    }
    expect(conversations).toHaveLength(1);
    expect(createInsert).not.toHaveBeenCalled();
  });

  it("saves requested notes against the new active conversation after expiry", async () => {
    seedMessage(91);
    vi.mocked(saveNote).mockResolvedValue({
      id: "note-1",
      title: "Revision",
      content: "Study notes",
      created_at: new Date(now).toISOString(),
    });
    vi.mocked(nebius.chat.completions.create).mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "save_note",
                  arguments: JSON.stringify({
                    title: "Revision",
                    content: "Study notes",
                  }),
                },
              },
            ],
          },
        },
      ],
    } as Awaited<ReturnType<typeof nebius.chat.completions.create>>);
    const response = await send();
    expect(response.status).toBe(200);
    const { conversationId } = await response.json();
    expect(conversationId).not.toBe(originalId);
    expect(saveNote).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        conversationId,
        title: "Revision",
        content: "Study notes",
      }),
    );
  });

  it("reuses an empty conversation", async () => {
    expect((await (await send()).json()).conversationId).toBe(originalId);
    expect(createInsert).not.toHaveBeenCalled();
  });

  it("creates a conversation when no ID was supplied", async () => {
    const response = await POST(jsonRequest("chat", { transcript: "Hello" }));
    expect(response.status).toBe(200);
    expect((await response.json()).conversationId).not.toBe(originalId);
    expect(createInsert).toHaveBeenCalledOnce();
  });

  it("creates a conversation for a null ID", async () => {
    const response = await send(null);
    expect(response.status).toBe(200);
    expect((await response.json()).conversationId).not.toBe(originalId);
  });

  it("rejects another student's conversation before reading messages or calling the AI", async () => {
    conversations[0].user_id = "other-user";
    expect((await send()).status).toBe(404);
    expect(from).not.toHaveBeenCalledWith("messages");
    expect(nebius.chat.completions.create).not.toHaveBeenCalled();
    expect(createInsert).not.toHaveBeenCalled();
  });

  it("rejects a missing conversation", async () => {
    conversations = [];
    expect((await send()).status).toBe(404);
    expect(createInsert).not.toHaveBeenCalled();
  });

  it("rejects malformed IDs", async () => {
    expect((await send("bad-id")).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it.each(["ownership", "activity", "creation", "timestamp"])(
    "fails safely on %s errors",
    async (failure) => {
      seedMessage(91);
      if (failure === "ownership") ownershipError = { message: "offline" };
      if (failure === "activity") latestError = { message: "offline" };
      if (failure === "creation") creationError = { message: "offline" };
      if (failure === "timestamp") messages[0].created_at = "invalid";
      expect((await send()).status).toBe(500);
      expect(nebius.chat.completions.create).not.toHaveBeenCalled();
      expect(messageInsert).not.toHaveBeenCalled();
      expect(conversations).toHaveLength(1);
      expect(messages).toHaveLength(1);
    },
  );
});
