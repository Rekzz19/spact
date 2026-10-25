import { beforeEach, describe, expect, it, vi } from "vitest";
import { nebius } from "@/lib/ai/nebius";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { POST } from "@/app/api/chat/route";
import { expectJson, jsonRequest, supabaseMock } from "../helpers";

vi.mock("@/lib/ai/nebius", () => ({
  nebius: { chat: { completions: { create: vi.fn() } } },
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
      conversationId: "conversation-1",
    });
  beforeEach(() => {
    db = supabaseMock();
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
    });
    expect(db.from).toHaveBeenCalledWith("messages");
    expect(db.select).toHaveBeenCalledWith("role, content");
    expect(db.eq).toHaveBeenCalledWith("conversation_id", "conversation-1");
    expect(db.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(db.limit).toHaveBeenCalledWith(10);
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
        conversation_id: "conversation-1",
        role: "user",
        content: "Plan my day",
      },
      {
        conversation_id: "conversation-1",
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
});
