// @vitest-environment jsdom
import {
  render,
  unmount,
  button,
  click,
  json,
  router,
  matchMedia,
  text,
} from "./helpers";
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import Home from "@/app/home/page";
import AnimatedText from "@/app/components/AnimatedText";
import ConversationMessages from "@/app/components/ConversationMessages";

const words = ["Remember", "Understand", "Master", "Own"] as const;

describe("Home page and animation", () => {
  it("renders the headline and subtitle and starts voice navigation", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ authenticated: false }, 401));
    await render(createElement(Home));
    expect(document.querySelector("h1")?.textContent).toContain("Say it.");
    expect(text()).toContain("Your AI revision partner.");
    await click(button("Start speaking"));
    expect(router.push).toHaveBeenCalledWith("/");
    expect(document.querySelector('a[href="/"]')?.textContent).toBe("Spact");
    expect(
      document.querySelector('header a[href="/register"]')?.textContent,
    ).toBe("Sign up");
  });
  it("renders logout for a signed-in account", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json({ authenticated: true, userId: "user-1", anonymous: false }),
    );
    await render(createElement(Home));
    expect(button("Log out")).not.toBeNull();
    expect(document.querySelector('header a[href="/register"]')).toBeNull();
  });
  it("offers signup to anonymous guests instead of logout", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json({ authenticated: true, userId: "guest-1", anonymous: true }),
    );
    await render(createElement(Home));
    expect(
      document.querySelector('header a[href="/register"]')?.textContent,
    ).toBe("Sign up");
    expect(document.querySelector("header")?.textContent).not.toContain(
      "Log out",
    );
  });
  it("rotates words on schedule and clears its timer on unmount", async () => {
    vi.useFakeTimers();
    const container = await render(createElement(AnimatedText, { words }));
    const visibleWord = () =>
      Array.from(container.querySelectorAll("span")).find(
        (span) => span.style.opacity === "1",
      )?.textContent;
    expect(visibleWord()).toBe("Remember");
    for (const word of ["Understand", "Master", "Own", "Remember"]) {
      await act(async () => vi.advanceTimersByTime(2800));
      expect(visibleWord()).toBe(word);
    }
    await unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("respects reduced motion by not starting a rotation timer", async () => {
    vi.useFakeTimers();
    matchMedia.mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    await render(createElement(AnimatedText, { words }));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Conversation scrolling (mocked DOM dimensions)", () => {
  const messages = [
    {
      id: 1,
      role: "user" as const,
      content: "Question",
      created_at: "2026-10-28T12:00:00Z",
    },
  ];
  it("jumps directly to the bottom before initial display", async () => {
    const height = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(1200);
    const container = await render(
      createElement(ConversationMessages, { messages }),
    );
    expect(container.firstElementChild?.scrollTop).toBe(1200);
    expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
    height.mockRestore();
  });
});
