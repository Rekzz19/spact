import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { saveNote } from "@/lib/notes/notes";

export async function POST(request: Request) {
  try {
    const { title, content, conversationId } = await request.json();

    // Validate the request
    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof content !== "string" ||
      !content.trim()
    ) {
      return NextResponse.json(
        //will this stop the application.
        { error: "Title and content are required" },
        { status: 400 },
      );
    }

    if (
      conversationId != null &&
      (typeof conversationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          conversationId,
        ))
    ) {
      return NextResponse.json(
        { error: "Invalid conversation ID" },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();

    // Identify the student from their session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    // Verify the conversation belongs to this user
    if (conversationId) {
      const { data: conversation, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .single();

      if (error || !conversation) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 },
        );
      }
    }

    //add the notes to the database
    const { data: note, error: saveError } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        conversation_id: conversationId ?? null,
        title: title.trim(),
        content: content.trim(),
      })
      .select("id, title, content, created_at")
      .single();

    if (saveError) {
      console.error("Failed to save note:", saveError);

      return NextResponse.json(
        { error: "Failed to save note" },
        { status: 500 },
      );
    }

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    console.error("Notes API error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
