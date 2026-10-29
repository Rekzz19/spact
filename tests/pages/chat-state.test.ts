import { describe, expect, it } from "vitest";
import {
  chatReducer,
  emptyChat,
  type ChatState,
  type DisplayMessage,
} from "@/lib/conversations/chat-state";

const message = (
  id: string,
  role: "user" | "assistant" = "user",
): DisplayMessage => ({
  id,
  role,
  content: `Message ${id}`,
  created_at: "2026-10-28T12:00:00Z",
});
const oldMessage = message("saved-1");
const pending = { ...message("local-1"), status: "sending" as const };
const reply = message("reply:local-1", "assistant");
const state: ChatState = {
  userId: "user-1",
  conversationId: "old",
  messages: [oldMessage],
};
const appendTranscript = (current = state) =>
  chatReducer(current, {
    type: "transcript",
    userId: "user-1",
    conversationId: "old",
    message: pending,
  });

describe("Conversation display state", () => {
  it("shows the first transcript immediately and appends the assistant response in order", () => {
    const first = appendTranscript({ ...state, messages: [] });
    expect(first.messages).toEqual([pending]);
    const result = chatReducer(first, {
      type: "reply",
      userId: "user-1",
      conversationId: "old",
      pendingId: "local-1",
      message: reply,
    });
    expect(result.messages).toEqual([{ ...pending, status: "saved" }, reply]);
  });

  it("replaces restored history rather than duplicating it", () => {
    const restore = {
      type: "restore" as const,
      userId: "user-1",
      conversationId: "old",
      messages: [oldMessage, message("saved-2", "assistant"), oldMessage],
    };
    const restored = chatReducer(state, restore);
    expect(restored.messages).toHaveLength(2);
    expect(chatReducer(restored, restore).messages).toEqual(restored.messages);
  });

  it("clears previous messages on expiry but keeps the current transcript", () => {
    const result = chatReducer(appendTranscript(), {
      type: "reply",
      userId: "user-1",
      conversationId: "new",
      pendingId: "local-1",
      message: reply,
    });
    expect(result.conversationId).toBe("new");
    expect(result.messages).toEqual([{ ...pending, status: "saved" }, reply]);
  });

  it("does not duplicate a locally delivered response", () => {
    const action = {
      type: "reply" as const,
      userId: "user-1",
      conversationId: "old",
      pendingId: "local-1",
      message: reply,
    };
    const first = chatReducer(appendTranscript(), action);
    expect(chatReducer(first, action).messages).toEqual(first.messages);
  });

  it("clears messages when the account changes and rejects late history from the old account", () => {
    const changed = chatReducer(state, { type: "reset", userId: "user-2" });
    expect(changed).toEqual({ ...emptyChat, userId: "user-2" });
    expect(
      chatReducer(changed, {
        type: "restore",
        userId: "user-1",
        conversationId: "old",
        messages: [oldMessage],
      }),
    ).toBe(changed);
    expect(
      chatReducer(changed, {
        type: "reply",
        userId: "user-1",
        conversationId: "old",
        pendingId: "local-1",
        message: reply,
      }),
    ).toBe(changed);
  });

  it("shows the default empty screen after expired history is restored", () => {
    expect(
      chatReducer(state, {
        type: "restore",
        userId: "user-1",
        conversationId: "old",
        messages: [],
      }).messages,
    ).toEqual([]);
  });

  it("marks failed chat messages without marking saved messages failed after a TTS error", () => {
    expect(
      chatReducer(appendTranscript(), {
        type: "failed",
        userId: "user-1",
        pendingId: "local-1",
      }).messages.at(-1)?.status,
    ).toBe("failed");
    const saved = chatReducer(appendTranscript(), {
      type: "reply",
      userId: "user-1",
      conversationId: "old",
      pendingId: "local-1",
      message: reply,
    });
    expect(
      chatReducer(saved, {
        type: "failed",
        userId: "user-1",
        pendingId: "local-1",
      }).messages,
    ).toEqual(saved.messages);
  });
});
