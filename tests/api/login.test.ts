import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import { POST } from "@/app/api/auth/login/route";
import { expectJson, jsonRequest } from "../helpers";

vi.mock("@/lib/supabase/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("POST /api/auth/login", () => {
  const signInWithPassword = vi.fn();
  const request = () =>
    jsonRequest("auth/login", {
      email: " user@example.com ",
      password: " password with spaces ",
    });
  beforeEach(() => {
    signInWithPassword
      .mockReset()
      .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { signInWithPassword },
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  });

  it("logs in, trimming the email without modifying the password", async () => {
    await expectJson(await POST(request()), 200, {
      success: true,
      userId: "user-1",
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: " password with spaces ",
    });
  });

  it.each([
    {},
    { email: 1, password: "secret" },
    { email: " ", password: "secret" },
    { email: "user@example.com" },
    { email: "user@example.com", password: 123 },
    { email: "user@example.com", password: "" },
  ])("rejects missing or invalid credentials (%j)", async (body) => {
    await expectJson(await POST(jsonRequest("auth/login", body)), 400, {
      error: "Email and password are required",
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    { data: { user: null }, error: { message: "private provider details" } },
    { data: { user: null }, error: null },
    {
      data: { user: { id: "user-1" } },
      error: { message: "invalid credentials" },
    },
  ])("returns a safe authentication error (%j)", async (result) => {
    signInWithPassword.mockResolvedValue(result);
    await expectJson(await POST(request()), 401, {
      error: "Invalid email or password",
    });
  });

  it("handles rejected provider calls", async () => {
    signInWithPassword.mockRejectedValue(new Error("offline"));
    await expectJson(await POST(request()), 500, { error: "Login failed" });
  });

  it("handles client initialization failure", async () => {
    vi.mocked(createSupabaseServerClient).mockRejectedValue(
      new Error("configuration missing"),
    );
    await expectJson(await POST(request()), 500, { error: "Login failed" });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("handles malformed JSON", async () => {
    await expectJson(
      await POST(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          body: "{",
        }),
      ),
      500,
      { error: "Login failed" },
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
