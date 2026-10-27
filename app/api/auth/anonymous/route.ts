import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";

export async function POST() {
  const supabase = await createSupabaseServerClient();

  // Check whether the user already has a session
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (user) {
    return NextResponse.json({
      userId: user.id,
      existing: true,
    });
  }

  // Do not create a new identity if verification failed for a reason other than no session.
  if (userError && userError.status !== 400) {
    return NextResponse.json(
      { error: "Could not verify session" },
      { status: 401 },
    );
  }

  // Create an anonymous account
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "Authentication failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    userId: data.user.id,
    existing: false,
  });
}
