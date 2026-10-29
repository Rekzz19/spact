import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import {
  ConversationError,
  isConversationExpired,
} from "@/lib/conversations/conversations";

const PAGE_SIZE = 1000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // Support UUID and positive bigint IDs without sending malformed casts to Postgres.
    const integerId =
      /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= BigInt("9223372036854775807");
    if (!uuidPattern.test(id) && !integerId) {
      return json({ error: "Invalid conversation ID" }, 400);
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) return json({ error: "Unauthorised" }, 401);

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) {
      // The deployed ID column may accept only one of the supported ID formats.
      if (
        conversationError.code === "22P02" ||
        conversationError.code === "22003"
      ) {
        return json({ error: "Invalid conversation ID" }, 400);
      }
      console.error("Conversation lookup failed:", conversationError);
      return json({ error: "Failed to retrieve conversation" }, 500);
    }
    if (!conversation)
      return json({ error: "Conversation not found or access denied" }, 404);

    // Fetch in batches so the Supabase row limit does not truncate longer chats.
    const messages = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error("Message retrieval failed:", error);
        return json({ error: "Failed to retrieve messages" }, 500);
      }
      if (!data?.length) break;
      messages.push(...data);
      offset += data.length;
      // Continue even after a short batch: the project may configure a lower row cap.
    }

    if (new URL(request.url).searchParams.get("activeOnly") === "true") {
      const latest = messages.at(-1);
      const active = !isConversationExpired(latest ? latest.created_at : null);
      return json({
        messages: active ? messages : [],
        active,
        userId: user.id,
      });
    }
    return json({ messages });
  } catch (error) {
    if (error instanceof ConversationError) {
      return json({ error: error.message }, error.status);
    }
    console.error("Conversation messages API error:", error);
    return json({ error: "Internal server error" }, 500);
  }
}
