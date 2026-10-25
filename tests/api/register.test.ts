import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/superbase/supabase-server";
import { POST } from "@/app/api/auth/register/route";
import { expectJson, jsonRequest } from "../helpers";

vi.mock("@/lib/superbase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("POST /api/auth/register", () => {
  const getUser = vi.fn();
  const updateUser = vi.fn();
  const request = () =>
    jsonRequest("auth/register", { email: "  person@example.com  " });
  beforeEach(() => {
    getUser
      .mockReset()
      .mockResolvedValue({
        data: { user: { id: "user-1", is_anonymous: true } },
        error: null,
      });
    updateUser.mockReset().mockResolvedValue({ error: null });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser, updateUser },
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  });

  it("links the trimmed email and asks the user to follow the confirmation link", async () => {
    await expectJson(await POST(request()), 200, {
      message:
        "Check your email and follow the confirmation link to complete registration.",
    });
    expect(updateUser).toHaveBeenCalledWith({ email: "person@example.com" });
  });

  it.each([{}, { email: "invalid" }])(
    "rejects invalid email (%j)",
    async (body) => {
      await expectJson(await POST(jsonRequest("auth/register", body)), 400, {
        error: "Invalid email address",
      });
      expect(updateUser).not.toHaveBeenCalled();
    },
  );

  it("rejects missing sessions", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it.each([null, "2026-10-25T12:00:00Z"])(
    "handles accounts that already have an email (confirmed: %s)",
    async (email_confirmed_at) => {
      getUser.mockResolvedValue({
        data: { user: { is_anonymous: false, email_confirmed_at } },
        error: null,
      });
      const response = await POST(request());
      expect(response.status).toBe(409);
      expect((await response.json()).error).toContain(
        email_confirmed_at ? "verified email" : "confirmation link",
      );
      expect(updateUser).not.toHaveBeenCalled();
    },
  );

  it.each(["email_exists", "user_already_exists", "identity_already_exists"])(
    "handles duplicate email error %s",
    async (code) => {
      updateUser.mockResolvedValue({ error: { code, message: "duplicate" } });
      await expectJson(await POST(request()), 409, {
        error:
          "This email is already associated with an account. Sign in with that account instead.",
      });
    },
  );

  it("handles email rate limits", async () => {
    updateUser.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", message: "rate limited" },
    });
    expect((await POST(request())).status).toBe(429);
  });

  it("handles unexpected provider failures", async () => {
    updateUser.mockResolvedValue({
      error: { code: "unexpected_failure", message: "unavailable" },
    });
    await expectJson(await POST(request()), 400, {
      error: "Unable to start email registration",
    });
  });
});
