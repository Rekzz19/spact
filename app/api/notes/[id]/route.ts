import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const integer =
      /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= BigInt("9223372036854775807");
    if (!uuid.test(id) && !integer)
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid note data" }, { status: 400 });
    }
    if (
      !body ||
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.length > 200 ||
      typeof body.content !== "string" ||
      body.content.length > 20000
    ) {
      return NextResponse.json(
        {
          error:
            "A title of 1–200 characters and a body of up to 20,000 characters are required",
        },
        { status: 400 },
      );
    }
    // Ownership and RLS apply to the update itself; never trust a client user ID.
    const { data: note, error } = await supabase
      .from("notes")
      .update({ title: body.title.trim(), content: body.content })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, title, content")
      .maybeSingle();
    if (error) {
      if (error.code === "22P02" || error.code === "22003")
        return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
      console.error("Note update failed:", error.code);
      return NextResponse.json(
        { error: "Could not save note" },
        { status: 500 },
      );
    }
    if (!note)
      return NextResponse.json(
        { error: "Note not found or access denied" },
        { status: 404 },
      );
    return NextResponse.json(
      { note },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Could not save note" }, { status: 500 });
  }
}
