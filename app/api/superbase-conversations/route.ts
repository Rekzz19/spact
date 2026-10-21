import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/superbase/supabase-server";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();

    // Identify the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    // Create a conversation belonging to this user
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase error:", error);

      return NextResponse.json(
        { error: "Failed to create conversation" }, //should be able to let application work w/o stopping totally
        { status: 500 },
      );
    }

    return NextResponse.json({ conversationId: data.id }, { status: 201 });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

//
