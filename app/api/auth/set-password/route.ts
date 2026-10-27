import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    // Basic password validation
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    ) {
      return NextResponse.json(
        { error: "Password must be 12–128 characters" },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();

    // Get the currently authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    // Ensure the account has a verified email
    if (!user.email || !user.email_confirmed_at) {
      return NextResponse.json(
        { error: "Verify your email before setting a password" },
        { status: 403 },
      );
    }

    // Set password on the existing account
    const { data, error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      console.error("Password setup failed:", error.message);

      return NextResponse.json(
        { error: "Unable to set password" },
        { status: 400 },
      );
    }

    if (!data.user || data.user.id !== user.id) {
      return NextResponse.json(
        { error: "Could not verify account identity" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password created successfully",
    });
  } catch (error) {
    console.error("Set password error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
