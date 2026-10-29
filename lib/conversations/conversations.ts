import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const INACTIVITY_MS = 90 * 60 * 1000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ConversationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

// Shared by message restoration (read-only) and chat conversation rollover.
export function isConversationExpired(createdAt: string | null) {
  if (createdAt === null) return false;
  const latestTimestamp = Date.parse(createdAt);
  if (!Number.isFinite(latestTimestamp)) {
    throw new ConversationError("Invalid conversation activity timestamp", 500);
  }
  return Date.now() - latestTimestamp >= INACTIVITY_MS;
}

export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ id: randomUUID(), user_id: userId })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("Conversation creation failed:", error);
    throw new ConversationError("Failed to create conversation", 500);
  }
  return data.id as string;
}

export async function resolveActiveConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId?: string | null,
) {
  if (conversationId == null) return createConversation(supabase, userId);

  const integerId =
    /^[1-9]\d{0,18}$/.test(conversationId) &&
    BigInt(conversationId) <= BigInt("9223372036854775807");
  if (!uuidPattern.test(conversationId) && !integerId) {
    throw new ConversationError("Invalid conversation ID", 400);
  }

  const { data: conversation, error: ownershipError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ownershipError) {
    console.error("Conversation ownership lookup failed:", ownershipError);
    const invalidId =
      ownershipError.code === "22P02" || ownershipError.code === "22003";
    throw new ConversationError(
      invalidId ? "Invalid conversation ID" : "Failed to retrieve conversation",
      invalidId ? 400 : 500,
    );
  }

  if (!conversation)
    throw new ConversationError("Conversation not found or access denied", 404);

  const { data: messages, error: latestError } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (latestError) {
    console.error("Conversation activity lookup failed:", latestError);
    throw new ConversationError("Failed to check conversation activity", 500);
  }
  if (!messages?.length) return conversation.id as string;

  if (typeof messages[0].created_at !== "string") {
    throw new ConversationError("Invalid conversation activity timestamp", 500);
  }

  return isConversationExpired(messages[0].created_at)
    ? createConversation(supabase, userId)
    : (conversation.id as string);
}
