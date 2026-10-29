import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import VoiceRedirect from "@/app/voice-interface/page";
import RootLayout from "@/app/layout";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist-sans" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));
vi.mock("@/app/globals.css", () => ({}));

describe("Application route shells (mocked Next framework boundaries)", () => {
  it("redirects the legacy voice URL to the default voice page", () => {
    expect(() => VoiceRedirect()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });
  it("renders the root document with the application fonts and page content", () => {
    const html = renderToStaticMarkup(
      RootLayout({
        children: createElement("main", null, "Page content"),
        params: Promise.resolve({}),
      }),
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain("geist-sans");
    expect(html).toContain("<main>Page content</main>");
  });
});
