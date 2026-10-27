import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { POST } from "@/app/api/auth/set-password/route";
import { expectJson, jsonRequest } from "../helpers";

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("POST /api/auth/set-password", () => {
  const getUser = vi.fn();
  const updateUser = vi.fn();
  const user = {
    id: "user-1",
    email: "user@example.com",
    email_confirmed_at: "2026-10-25T12:00:00Z",
  };
  const request = () =>
    jsonRequest("auth/set-password", { password: "a valid password" });
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user }, error: null });
    updateUser.mockReset().mockResolvedValue({ data: { user }, error: null });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser, updateUser },
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  });

  it.each([12, 128])(
    "accepts the %i-character boundary and updates the existing account",
    async (length) => {
      const password = "x".repeat(length);
      await expectJson(
        await POST(jsonRequest("auth/set-password", { password })),
        200,
        { success: true, message: "Password created successfully" },
      );
      expect(updateUser).toHaveBeenCalledExactlyOnceWith({ password });
    },
  );

  it.each([undefined, null, 123, "", "x".repeat(11), "x".repeat(129)])(
    "rejects invalid passwords (%j)",
    async (password) => {
      await expectJson(
        await POST(jsonRequest("auth/set-password", { password })),
        400,
        { error: "Password must be 12–128 characters" },
      );
      expect(createSupabaseServerClient).not.toHaveBeenCalled();
      expect(updateUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    { data: { user: null }, error: null },
    { data: { user }, error: { message: "expired" } },
  ])("requires a valid authenticated session (%j)", async (result) => {
    getUser.mockResolvedValue(result);
    await expectJson(await POST(request()), 401, { error: "Unauthorised" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it.each([
    { ...user, email: null },
    { ...user, email_confirmed_at: null },
  ])("requires a verified email (%j)", async (unverifiedUser) => {
    getUser.mockResolvedValue({ data: { user: unverifiedUser }, error: null });
    await expectJson(await POST(request()), 403, {
      error: "Verify your email before setting a password",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("returns a safe error when the provider rejects the password", async () => {
    updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "private provider details" },
    });
    await expectJson(await POST(request()), 400, {
      error: "Unable to set password",
    });
  });

  it.each([null, { id: "different-user" }])(
    "rejects missing or changed account identity (%j)",
    async (updatedUser) => {
      updateUser.mockResolvedValue({
        data: { user: updatedUser },
        error: null,
      });
      await expectJson(await POST(request()), 500, {
        error: "Could not verify account identity",
      });
    },
  );

  it.each(["getUser", "updateUser"])(
    "handles a rejected %s call",
    async (method) => {
      (method === "getUser" ? getUser : updateUser).mockRejectedValue(
        new Error("offline"),
      );
      await expectJson(await POST(request()), 500, {
        error: "Internal server error",
      });
      if (method === "getUser") expect(updateUser).not.toHaveBeenCalled();
    },
  );

  it("handles client initialization failure", async () => {
    vi.mocked(createSupabaseServerClient).mockRejectedValue(
      new Error("configuration missing"),
    );
    await expectJson(await POST(request()), 500, {
      error: "Internal server error",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("handles malformed JSON", async () => {
    await expectJson(
      await POST(
        new Request("http://localhost/api/auth/set-password", {
          method: "POST",
          body: "{",
        }),
      ),
      500,
      { error: "Internal server error" },
    );
    expect(updateUser).not.toHaveBeenCalled();
  });
});
