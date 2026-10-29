// @vitest-environment jsdom
import { render, button, click, json, deferred, finish, text } from "./helpers";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "@/app/components/Sidebar";
import Note from "@/app/components/Note";
import NoteLoading from "@/app/notes/[id]/loading";
import NoteError from "@/app/notes/[id]/error";

describe("Notes components (mocked HTTP and native dialog)", () => {
  it("renders note title and body as plain text, preserving multiline content", async () => {
    await render(
      createElement(Note, {
        title: "Osmosis",
        body: "First line\n<script>not executable</script>",
      }),
    );
    expect(document.querySelector("h1")?.textContent).toBe("Osmosis");
    expect(text()).toContain("First line\n<script>not executable</script>");
    expect(document.querySelector("script")).toBeNull();
  });
  it("renders the loading state", async () => {
    await render(createElement(NoteLoading));
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "Loading note",
    );
  });
  it("renders the error fallback and allows resetting the boundary", async () => {
    const reset = vi.fn();
    await render(createElement(NoteError, { reset }));
    expect(document.querySelector("h1")?.textContent).toBe(
      "Could not load this note",
    );
    await click(button("Try again"));
    expect(reset).toHaveBeenCalledOnce();
  });
  it("loads note titles on opening, links to their full pages, and closes on selection", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json({
        notes: [
          { id: "note-1", title: "Cell membranes" },
          { id: "note-2", title: "Photosynthesis" },
        ],
      }),
    );
    await render(createElement(Sidebar));
    expect(fetch).not.toHaveBeenCalled();
    await click(button("Open sidebar"));
    expect(button("Open sidebar").getAttribute("aria-expanded")).toBe("true");
    const links = Array.from(
      document.querySelectorAll('nav[aria-label="Saved notes"] a'),
    );
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Cell membranes", "/notes/note-1"],
      ["Photosynthesis", "/notes/note-2"],
    ]);
    // Prevent jsdom from attempting navigation; the real onClick still runs.
    links[0].addEventListener("click", (event) => event.preventDefault());
    await click(links[0] as HTMLElement);
    expect(document.querySelector("dialog")?.open).toBe(false);
  });
  it("shows loading while a note list request is pending", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    await render(createElement(Sidebar));
    await click(button("Open sidebar"));
    expect(text()).toContain("Loading notes");
    await finish(pending, json({ notes: [] }));
    expect(text()).toContain("No saved notes yet.");
  });
  it("shows the signed-out guidance after an unauthorised response", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "Unauthorised" }, 401));
    await render(createElement(Sidebar));
    await click(button("Open sidebar"));
    expect(text()).toContain("Start a conversation or log in");
    expect(
      document.querySelectorAll('nav[aria-label="Saved notes"] a'),
    ).toHaveLength(0);
  });
  it("allows retrying a failed note list request", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ error: "Offline" }, 500))
      .mockResolvedValueOnce(
        json({ notes: [{ id: "note-1", title: "Recovered note" }] }),
      );
    await render(createElement(Sidebar));
    await click(button("Open sidebar"));
    expect(text()).toContain("Could not load notes.");
    await click(button("Try again"));
    expect(text()).toContain("Recovered note");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("clears previously displayed note links when reopening after logout", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ notes: [{ id: "note-1", title: "Private note" }] }),
      )
      .mockResolvedValueOnce(json({ error: "Unauthorised" }, 401));
    await render(createElement(Sidebar));
    await click(button("Open sidebar"));
    expect(text()).toContain("Private note");
    await click(button("Close sidebar"));
    await click(button("Open sidebar"));
    expect(text()).not.toContain("Private note");
  });
});
