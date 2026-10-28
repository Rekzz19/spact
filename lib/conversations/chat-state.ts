export type DisplayMessage = {
  id: string | number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  status?: "sending" | "saved" | "failed";
};

export type ChatState = {
  userId: string | null;
  conversationId: string | null;
  messages: DisplayMessage[];
};

export const emptyChat: ChatState = {
  userId: null,
  conversationId: null,
  messages: [],
};

type ChatAction =
  | { type: "reset"; userId: string | null }
  | {
      type: "restore";
      userId: string;
      conversationId: string;
      messages: DisplayMessage[];
    }
  | {
      type: "transcript";
      userId: string;
      conversationId: string;
      message: DisplayMessage;
    }
  | {
      type: "reply";
      userId: string;
      conversationId: string;
      pendingId: string;
      message: DisplayMessage;
    }
  | { type: "failed"; userId: string; pendingId: string };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === "reset") return { ...emptyChat, userId: action.userId };
  // Ignore responses from requests started under a different account.
  if (action.userId !== state.userId) return state;
  if (action.type === "restore") {
    return {
      ...state,
      conversationId: action.conversationId,
      messages: Array.from(
        new Map(
          action.messages.map((message) => [message.id, message]),
        ).values(),
      ),
    };
  }
  if (action.type === "transcript") {
    const messages =
      state.conversationId === action.conversationId ? state.messages : [];
    return {
      ...state,
      conversationId: action.conversationId,
      messages: [
        ...messages.filter((message) => message.id !== action.message.id),
        action.message,
      ],
    };
  }
  if (action.type === "failed") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === action.pendingId && message.status === "sending"
          ? { ...message, status: "failed" }
          : message,
      ),
    };
  }
  const messages =
    state.conversationId === action.conversationId
      ? state.messages
      : state.messages.filter((message) => message.id === action.pendingId);
  return {
    ...state,
    conversationId: action.conversationId,
    messages: [
      ...messages
        .filter((message) => message.id !== action.message.id)
        .map((message) =>
          message.id === action.pendingId
            ? { ...message, status: "saved" as const }
            : message,
        ),
      action.message,
    ],
  };
}
