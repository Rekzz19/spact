import { NextResponse } from "next/server";
import { supabase } from "@/lib/superbase/superbase";

export async function GET() {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("Supabase error:", error);

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    connected: true,
    data,
  });
}
