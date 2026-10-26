import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { GET } from "@/app/api/auth/session/route";
import { expectJson } from "../helpers";

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("GET /api/auth/session", () => {
  const getUser = vi.fn();
  beforeEach(() => {
    getUser.mockReset();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser },
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  });

  it.each([false, true])(
    "returns the verified session and identifies anonymous users (%s)",
    async (anonymous) => {
      getUser.mockResolvedValue({
        data: {
          user: {
            id: "user-1",
            is_anonymous: anonymous,
            email: "private@example.com",
            user_metadata: { private: "not for the session response" },
          },
        },
        error: null,
      });

      await expectJson(await GET(), 200, {
        authenticated: true,
        userId: "user-1",
        anonymous,
      });
      expect(createSupabaseServerClient).toHaveBeenCalledOnce();
      expect(getUser).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it("returns 401 when no user session exists", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expectJson(await GET(), 401, { authenticated: false });
  });

  it("returns 401 for an expired or invalid session", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Expired session", status: 401 },
    });
    await expectJson(await GET(), 401, { authenticated: false });
  });

  it("does not report authentication if verification returns both a user and an error", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", is_anonymous: false } },
      error: { message: "Verification failed" },
    });
    await expectJson(await GET(), 401, { authenticated: false });
  });
});
