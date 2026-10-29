import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { saveNote } from "@/lib/notes/notes";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data: notes, error } = await supabase
      .from("notes")
      .select("id, title")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(
      { notes: notes ?? [] },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    console.error("Notes retrieval failed:", error);
    return NextResponse.json(
      { error: "Failed to load notes" },
      { status: 500 },
    );
  }
}

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
