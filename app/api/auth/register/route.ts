import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/superbase/supabase-server";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (
      //checks the email used
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient(); //gets the superbase client

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(); //gets the anonymous user ID

    if (authError || !user) {
      return NextResponse.json(
        {
          error:
            "Your session has expired. Open Spact and try registering again.",
        },
        { status: 401 },
      );
    }

    if (!user.is_anonymous) {
      //returned user is not anonymous
      return NextResponse.json(
        {
          error: user.email_confirmed_at
            ? "Your account already has a verified email. You do not need to register again."
            : "Your account already has an email associated with it. Check your inbox for the confirmation link.",
        },
        { status: 409 },
      );
    }

    const { error } = await supabase.auth.updateUser(
      {
        //sends message to new user
        email: email.trim(),
      },
      {
        emailRedirectTo: "http://localhost:3000/set-password",
      },
    );

    if (error) {
      console.error("Email linking error:", error.message);

      if (
        error.code === "email_exists" ||
        error.code === "user_already_exists" ||
        error.code === "identity_already_exists"
      ) {
        return NextResponse.json(
          {
            error:
              "This email is already associated with an account. Sign in with that account instead.",
          },
          { status: 409 },
        );
      }

      if (
        error.status === 429 ||
        error.code === "over_email_send_rate_limit" ||
        error.code === "over_request_rate_limit"
      ) {
        return NextResponse.json(
          {
            error:
              "Too many requests. Please wait a few minutes before trying again.",
          },
          { status: 429 },
        );
      }

      return NextResponse.json(
        { error: "Unable to start email registration" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message:
        "Check your email and follow the confirmation link to complete registration.",
    });
  } catch (error) {
    console.error("Registration error:", error);

    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
