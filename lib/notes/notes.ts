import type { SupabaseClient } from "@supabase/supabase-js";

type SaveNoteInput = {
  supabase: SupabaseClient;
  userId: string;
  title: string;
  content: string;
  conversationId?: string | null;
};

export async function saveNote({
  supabase,
  userId,
  title,
  content,
  conversationId,
}: SaveNoteInput) {
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 200 ||
    typeof content !== "string" ||
    !content.trim() ||
    content.length > 20000
  ) {
    throw new Error("Invalid note title or content");
  }

  if (conversationId) {
    const { data: conversation, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();

    if (error || !conversation) {
      throw new Error("Conversation not found or access denied");
    }
  }

  const { data: note, error } = await supabase
    .from("notes")
    .insert({
      user_id: userId,
      conversation_id: conversationId ?? null,
      title: title.trim(),
      content: content.trim(),
    })
    .select("id, title, content, created_at")
    .single();

  if (error || !note) {
    console.error("Supabase note insert failed:", error);
    throw new Error("Failed to save note");
  }

  return note;
}
