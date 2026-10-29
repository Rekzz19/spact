import { beforeEach, describe, expect, it, vi } from "vitest";
import { nebius } from "@/lib/ai/nebius";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { POST } from "@/app/api/chat/route";
import { saveNote } from "@/lib/notes/notes";
vi.mock("@/lib/notes/notes", () => ({ saveNote: vi.fn() }));
import { expectJson, jsonRequest, supabaseMock } from "../helpers";

vi.mock("@/lib/ai/nebius", () => ({
  nebius: {
    chat: { completions: { create: vi.fn() } },
    models: { list: vi.fn().mockResolvedValue({ data: [] }) },
  },
}));
vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("POST /api/chat", () => {
  let db: ReturnType<typeof supabaseMock>;
  const create = vi.mocked(nebius.chat.completions.create);
  const request = () =>
    jsonRequest("chat", {
      transcript: "Plan my day",
      conversationId: "11111111-1111-4111-8111-111111111111",
    });
  beforeEach(() => {
    vi.mocked(nebius.models.list).mockResolvedValue({
      data: [],
    } as unknown as Awaited<ReturnType<typeof nebius.models.list>>);
    db = supabaseMock();
    const ownership = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "11111111-1111-4111-8111-111111111111" },
        error: null,
      }),
    };
    ownership.eq.mockReturnValue(ownership);
    const originalFrom = db.from.getMockImplementation()!;
    const activity = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    activity.select.mockReturnValue(activity);
    activity.eq.mockReturnValue(activity);
    activity.order.mockReturnValue(activity);
    const messageSelect = db.select.getMockImplementation()!;
    db.select.mockImplementation((columns) =>
      columns === "created_at" ? activity : messageSelect(),
    );
    db.from.mockImplementation((table) =>
      table === "conversations" ? { select: () => ownership } : originalFrom(),
    );
    vi.stubEnv("SPACT_NEBIUS_API_KEY", "test-nebius");
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      db as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
    create.mockReset();
    // Only the fields read by this endpoint are needed in the provider fixture.
    create.mockResolvedValue({
      choices: [
        {
          message: { content: "What is your priority?" },
          finish_reason: "stop",
        },
      ],
    } as Awaited<ReturnType<typeof nebius.chat.completions.create>>);
  });

  it("uses chronological history and saves both messages before returning the reply", async () => {
    const older = { role: "user", content: "I want to study" };
    const newer = { role: "assistant", content: "Which subject?" };
    db.limit.mockResolvedValue({ data: [newer, older], error: null });
    await expectJson(await POST(request()), 200, {
      reply: "What is your priority?",
      userId: "user-1",
      conversationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(db.from).toHaveBeenCalledWith("messages");
    expect(db.select).toHaveBeenCalledWith("role, content");
    expect(db.eq).toHaveBeenCalledWith(
      "conversation_id",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(db.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(db.limit).toHaveBeenCalledWith(100);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({ role: "system" }),
          older,
          newer,
          { role: "user", content: "Plan my day" },
        ],
        chat_template_kwargs: { enable_thinking: false },
      }),
    );
    expect(db.insert).toHaveBeenCalledWith([
      {
        conversation_id: "11111111-1111-4111-8111-111111111111",
        role: "user",
        content: "Plan my day",
      },
      {
        conversation_id: "11111111-1111-4111-8111-111111111111",
        role: "assistant",
        content: "What is your priority?",
      },
    ]);
  });

  it.each([
    {},
    { transcript: 123, conversationId: "c" },
    { transcript: " ", conversationId: "c" },
    { transcript: "a".repeat(5001), conversationId: "c" },
    { transcript: "Hello", conversationId: 1 },
  ])("rejects invalid input (%j)", async (body) => {
    await expectJson(await POST(jsonRequest("chat", body)), 400, {
      error: "Invalid transcript",
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: "user-1" } }, error: { message: "Expired session" } },
  ])("blocks unauthenticated requests (%j)", async (result) => {
    db.auth.getUser.mockResolvedValue(result);
    await expectJson(await POST(request()), 401, { error: "Unauthorised" });
    expect(db.from).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("does not call the model if retrieving history fails", async () => {
    db.limit.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expectJson(await POST(request()), 500, {
      error: "Failed to retrieve conversation history",
    });
    expect(create).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("handles a new conversation with null history", async () => {
    db.limit.mockResolvedValue({ data: null, error: null });
    await expectJson(await POST(request()), 200, {
      reply: "What is your priority?",
      userId: "user-1",
      conversationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({ role: "system" }),
          { role: "user", content: "Plan my day" },
        ],
      }),
    );
  });

  it("does not invoke the model without credentials", async () => {
    vi.stubEnv("SPACT_NEBIUS_API_KEY", undefined);
    await expectJson(await POST(request()), 500, {
      error: "Nebius API key missing",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("removes asterisks before returning and saving the reply", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "**Correct!** What is *osmosis*?" } }],
    } as Awaited<ReturnType<typeof nebius.chat.completions.create>>);

    await expectJson(await POST(request()), 200, {
      reply: "Correct! What is osmosis?",
      userId: "user-1",
      conversationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(db.insert).toHaveBeenCalledWith([
      expect.objectContaining({ role: "user", content: "Plan my day" }),
      {
        conversation_id: "11111111-1111-4111-8111-111111111111",
        role: "assistant",
        content: "Correct! What is osmosis?",
      },
    ]);
  });

  it("handles provider errors without saving partial messages", async () => {
    create.mockRejectedValue(new Error("Provider unavailable"));
    await expectJson(await POST(request()), 502, {
      error: "Could not generate an AI response",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects an empty provider reply without saving it", async () => {
    create.mockResolvedValue({ choices: [] } as unknown as Awaited<
      ReturnType<typeof nebius.chat.completions.create>
    >);
    await expectJson(await POST(request()), 502, {
      error: "Could not generate an AI response",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("reports database save failures instead of claiming success", async () => {
    db.insert.mockReturnValue({
      error: { message: "Write failed" },
      select: db.insertedSelect,
    });
    await expectJson(await POST(request()), 500, {
      error: "Failed to save conversation",
    });
  });

  it("handles malformed JSON", async () => {
    await expectJson(
      await POST(
        new Request("http://localhost/api/chat", { method: "POST", body: "{" }),
      ),
      502,
      { error: "Could not generate an AI response" },
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("executes a valid save_note tool call and confirms only after saving", async () => {
    vi.mocked(saveNote).mockResolvedValue({
      id: "note-1",
      title: "Cells",
      content: "Cell notes",
      created_at: "2026-10-28T12:00:00Z",
    });
    create.mockResolvedValue({
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
                    title: "Cells",
                    content: "Cell notes",
                  }),
                },
              },
            ],
          },
        },
      ],
    } as Awaited<ReturnType<typeof nebius.chat.completions.create>>);
    await expectJson(
      await POST(
        jsonRequest("chat", {
          transcript: "Please save notes about cells",
          conversationId: "11111111-1111-4111-8111-111111111111",
        }),
      ),
      200,
      {
        reply: "I've saved your note titled Cells.",
        userId: "user-1",
        conversationId: "11111111-1111-4111-8111-111111111111",
      },
    );
    expect(saveNote).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        title: "Cells",
        content: "Cell notes",
        conversationId: "11111111-1111-4111-8111-111111111111",
      }),
    );
  });

  it.each(["not JSON", JSON.stringify({ title: "Missing content" })])(
    "does not claim to save malformed tool arguments (%s)",
    async (args) => {
      create.mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "save_note", arguments: args },
                },
              ],
            },
          },
        ],
      } as Awaited<ReturnType<typeof nebius.chat.completions.create>>);
      await expectJson(await POST(request()), 200, {
        reply: "Sorry, I couldn't save that note. Please try again.",
        userId: "user-1",
        conversationId: "11111111-1111-4111-8111-111111111111",
      });
      expect(saveNote).not.toHaveBeenCalled();
    },
  );

  it("reports tool save failures honestly while preserving a conversational reply", async () => {
    vi.mocked(saveNote).mockRejectedValue(new Error("Database unavailable"));
    create.mockResolvedValue({
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
                    title: "Cells",
                    content: "Cell notes",
                  }),
                },
              },
            ],
          },
        },
      ],
    } as Awaited<ReturnType<typeof nebius.chat.completions.create>>);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).reply).toBe(
      "Sorry, I couldn't save that note. Please try again.",
    );
    expect(db.insert).toHaveBeenCalled();
  });
});
