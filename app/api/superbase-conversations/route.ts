import { NextResponse } from "next/server";
import {
  ConversationError,
  createConversation,
} from "@/lib/conversations/conversations";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";

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

    const conversationId = await createConversation(supabase, user.id);
    return NextResponse.json({ conversationId }, { status: 201 });
  } catch (error) {
    if (error instanceof ConversationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error(error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
