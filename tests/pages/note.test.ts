import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NotePage from "@/app/notes/[id]/page";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { supabaseMock } from "../helpers";
import { connection } from "next/server";

vi.mock("next/server", () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/app/components/Sidebar", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
}));

describe("Note page access", () => {
  let db: ReturnType<typeof supabaseMock>;
  const maybeSingle = vi.fn();
  const render = () => NotePage({ params: Promise.resolve({ id: "note-1" }) });
  beforeEach(() => {
    db = supabaseMock();
    db.eq.mockReturnValue({ eq: db.eq, maybeSingle });
    maybeSingle.mockResolvedValue({
      data: { title: "Osmosis", content: "Water movement" },
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      db as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    );
  });

  it("loads the selected note only when it belongs to the current user", async () => {
    const html = renderToStaticMarkup(await render());
    expect(html).toContain("Osmosis");
    expect(html).toContain("Water movement");
    expect(html).toContain('href="/"');
    expect(connection).toHaveBeenCalled();
    expect(vi.mocked(connection).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createSupabaseServerClient).mock.invocationCallOrder[0],
    );
    expect(db.from).toHaveBeenCalledWith("notes");
    expect(db.select).toHaveBeenCalledWith("title, content");
    expect(db.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(db.eq).toHaveBeenCalledWith("id", "note-1");
  });

  it("returns not found for missing or inaccessible notes", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(render()).rejects.toThrow("not found");
  });

  it("redirects unauthenticated users before querying notes", async () => {
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(render()).rejects.toThrow("redirect");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("surfaces database failures to the error boundary", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "offline" },
    });
    await expect(render()).rejects.toThrow("Failed to load note");
  });
});
