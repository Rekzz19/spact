import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { saveNote } from "@/lib/notes/notes";

export async function POST(request: Request) {
  try {
    const { title, content, conversationId } = await request.json();

    const supabase = await createSupabaseServerClient();

    // Identify the student from their session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const note = await saveNote({
      supabase,
      userId: user.id,
      title,
      content,
      conversationId,
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    console.error("Notes API error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
