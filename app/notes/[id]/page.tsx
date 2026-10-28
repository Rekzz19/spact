import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import Note from "@/app/components/Note";
import Sidebar from "@/app/components/Sidebar";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Session-dependent notes and auth SDK timing must run at request time.
  await connection();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const { data: note, error } = await supabase
    .from("notes")
    .select("title, content")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Failed to load note");
  if (!note) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between p-6">
        <Sidebar />
        <Link
          href="/"
          className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          Back to Voice
        </Link>
      </header>
      <main className="flex-1 px-6 py-10 sm:px-10">
        <Note title={note.title} body={note.content} />
      </main>
    </div>
  );
}
