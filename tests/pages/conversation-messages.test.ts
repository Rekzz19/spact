import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ConversationMessages from "@/app/components/ConversationMessages";

describe("Conversation messages rendering", () => {
  it("renders both speakers in chronological order with readable plain text", () => {
    const html = renderToStaticMarkup(
      createElement(ConversationMessages, {
        messages: [
          {
            id: 1,
            role: "user",
            content: "Explain <osmosis>",
            created_at: "2026-10-28T12:00:00Z",
          },
          {
            id: 2,
            role: "assistant",
            content: "Water moves across a membrane.",
            created_at: "2026-10-28T12:00:01Z",
          },
        ],
      }),
    );
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-label="Your message"');
    expect(html).toContain('aria-label="Spact&#x27;s response"');
    expect(html.indexOf("Explain &lt;osmosis&gt;")).toBeLessThan(
      html.indexOf("Water moves across a membrane."),
    );
    expect(html).toContain("whitespace-pre-wrap");
  });
});
