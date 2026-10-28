// @vitest-environment jsdom
import { render, button, input, fill, click, submit, json, deferred, finish, text, router } from "./helpers";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "@/app/login/page";
import Register from "@/app/register/page";
import SetPassword from "@/app/set-password/page";
import LogoutButton from "@/app/components/LogoutButton";

beforeEach(() => { vi.mocked(fetch).mockReset().mockRejectedValue(new Error("Unexpected request")); });

describe("Login page (mocked HTTP and Next navigation)", () => {
  it("renders labelled credentials and registration navigation", async () => {
    await render(createElement(Login));
    expect(document.querySelector("h1")?.textContent).toBe("Welcome back.");
    expect(input("Email address").type).toBe("email");
    expect(input("Password").autocomplete).toBe("current-password");
    expect(document.querySelector('a[href="/register"]')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("submits credentials and navigates only after server success", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ success: true }));
    await render(createElement(Login));
    await fill(input("Email address"), "person@example.com");
    await fill(input("Password"), "long-password");
    await submit();
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "person@example.com", password: "long-password" }) }));
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(input("Password").value).toBe("");
  });
  it("shows server rejection and keeps the student on the page", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "Invalid credentials" }, 401));
    await render(createElement(Login));
    await fill(input("Email address"), "person@example.com");
    await fill(input("Password"), "wrong-password");
    await submit();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Invalid credentials");
    expect(router.replace).not.toHaveBeenCalled();
    expect(button("Log in").disabled).toBe(false);
  });
  it("rejects invalid form data without contacting the API", async () => {
    await render(createElement(Login));
    await fill(input("Email address"), "invalid");
    await submit();
    expect(text()).toContain("Enter a valid email address.");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("prevents duplicate submissions while the request is pending", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    await render(createElement(Login));
    await fill(input("Email address"), "person@example.com");
    await fill(input("Password"), "long-password");
    await submit();
    await submit();
    expect(fetch).toHaveBeenCalledOnce();
    expect(button("Logging in...").disabled).toBe(true);
    await finish(pending, json({ success: true }));
  });
});

describe("Register page", () => {
  it("renders an email form and login navigation", async () => {
    await render(createElement(Register));
    expect(document.querySelector("h1")?.textContent).toBe("Make knowledge stick.");
    expect(input("Email address")).not.toBeNull();
    expect(document.querySelector('a[href="/login"]')).not.toBeNull();
  });
  it("shows confirmation only after success and prevents resending until email changes", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ message: "Check your email." }));
    await render(createElement(Register));
    await fill(input("Email address"), "person@example.com");
    await submit();
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Check your email.");
    expect(button("Check your inbox").disabled).toBe(true);
    await fill(input("Email address"), "other@example.com");
    expect(button("Create account").disabled).toBe(false);
    expect(document.querySelector('[role="status"]')).toBeNull();
  });
  it("displays rate-limit errors and allows retry", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "Too many requests" }, 429));
    await render(createElement(Register));
    await fill(input("Email address"), "person@example.com");
    await submit();
    expect(text()).toContain("Too many requests");
    expect(button("Create account").disabled).toBe(false);
  });
});

describe("Set-password page", () => {
  it("renders matching password inputs and waits for the session check", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    await render(createElement(SetPassword));
    expect(document.querySelector("h1")?.textContent).toBe("Make it yours.");
    expect(input("Confirm password").autocomplete).toBe("new-password");
    expect(button("Set password").disabled).toBe(true);
    await finish(pending, json({ userId: "user-1" }));
    expect(button("Set password").disabled).toBe(false);
  });
  it("does not submit mismatched passwords", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ userId: "user-1" }));
    await render(createElement(SetPassword));
    await fill(input("Password"), "long-password-one");
    await fill(input("Confirm password"), "long-password-two");
    await submit();
    expect(text()).toContain("Passwords do not match.");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("sets a matching password and returns to voice after success", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ success: true }));
    await render(createElement(SetPassword));
    await fill(input("Password"), "long-password-one");
    await fill(input("Confirm password"), "long-password-one");
    await submit();
    expect(fetch).toHaveBeenLastCalledWith("/api/auth/set-password", expect.objectContaining({ body: JSON.stringify({ password: "long-password-one" }) }));
    expect(router.push).toHaveBeenCalledWith("/");
  });
  it("shows a failed verification check and leaves submission disabled", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "Expired" }, 401));
    await render(createElement(SetPassword));
    expect(text()).toContain("Your session has expired.");
    expect(button("Set password").disabled).toBe(true);
  });
  it.fails("[known defect] opening set-password should verify a session without creating an anonymous identity", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ userId: "user-1" }));
    await render(createElement(SetPassword));
    expect(fetch).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ method: "GET" }));
    expect(fetch).not.toHaveBeenCalledWith("/api/auth/anonymous", expect.anything());
  });
});

describe("Logout control", () => {
  it("navigates and refreshes after a successful logout", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ success: true }));
    await render(createElement(LogoutButton));
    await click(button("Log out"));
    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(router.refresh).toHaveBeenCalledOnce();
  });
  it("keeps the current page and displays failures", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "Could not log out" }, 500));
    await render(createElement(LogoutButton));
    await click(button("Log out"));
    expect(text()).toContain("Could not log out");
    expect(router.replace).not.toHaveBeenCalled();
  });
});
