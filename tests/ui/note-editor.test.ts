// @vitest-environment jsdom
import {
  render,
  unmount,
  input,
  fill,
  button,
  click,
  json,
  deferred,
  finish,
  router,
  text,
} from "./helpers";
import { act, createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NoteEditor from "@/app/components/NoteEditor";

const id = "11111111-1111-4111-8111-111111111111";
const mount = () =>
  render(
    createElement(NoteEditor, {
      id,
      title: "Original title",
      body: "Original body",
    }),
  );
const body = () => document.querySelector<HTMLTextAreaElement>("#note-body")!;
const status = () => document.querySelector('[role="status"]')?.textContent;
const advance = (ms = 750) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const blur = (element: HTMLElement) =>
  act(async () => {
    element.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockResolvedValue(json({ note: { id } }));
});

describe("Note editor autosave (mocked HTTP, real editing events)", () => {
  it("renders editable fields without writing on initial load", async () => {
    await mount();
    expect(input("Note title").value).toBe("Original title");
    expect(body().value).toBe("Original body");
    expect(status()).toBe("Saved");
    await advance(1500);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("debounces edits and saves the newest title and body together", async () => {
    await mount();
    await fill(input("Note title"), "New title");
    await advance(500);
    await fill(body(), "New\nbody");
    await advance(749);
    expect(fetch).not.toHaveBeenCalled();
    expect(status()).toBe("Unsaved changes");
    await advance(1);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      `/api/notes/${id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "New title", content: "New\nbody" }),
      }),
    );
    expect(status()).toBe("Saved");
  });
  it("shows Saving until the server acknowledges the write", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    await mount();
    await fill(body(), "Changed");
    await advance();
    expect(status()).toBe("Saving…");
    await finish(pending, json({ note: { id } }));
    expect(status()).toBe("Saved");
  });
  it("serializes saves and retains typing that happens during an in-flight save", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(json({ note: { id } }));
    await mount();
    await fill(body(), "First edit");
    await advance();
    await fill(body(), "Newest edit");
    await advance();
    expect(fetch).toHaveBeenCalledOnce();
    await finish(pending, json({ note: { id } }));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).content,
    ).toBe("Newest edit");
    expect(body().value).toBe("Newest edit");
    expect(status()).toBe("Saved");
  });
  it("preserves failed edits and retries them explicitly", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ error: "Save failed" }, 500))
      .mockResolvedValue(json({ note: { id } }));
    await mount();
    await fill(body(), "Keep this draft");
    await advance();
    expect(status()).toBe("Not saved");
    expect(body().value).toBe("Keep this draft");
    expect(text()).toContain("Save failed");
    await click(button("Retry"));
    expect(status()).toBe("Saved");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("saves on field blur without waiting for the debounce", async () => {
    await mount();
    await fill(body(), "Blur edit");
    await blur(body());
    expect(fetch).toHaveBeenCalledOnce();
    await advance();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not repeatedly save unchanged content", async () => {
    await mount();
    await fill(body(), "Changed");
    await advance();
    await blur(body());
    await advance();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("keeps a blank title editable and explains why it cannot save", async () => {
    await mount();
    await fill(input("Note title"), "");
    await advance();
    expect(text()).toContain("Add a title");
    expect(fetch).not.toHaveBeenCalled();
    await fill(input("Note title"), "Restored title");
    await advance();
    expect(status()).toBe("Saved");
  });
  it("flushes edits before following an internal navigation link", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    await mount();
    await fill(body(), "Before navigation");
    const link = document.createElement("a");
    link.href = "/";
    document.body.append(link);
    await click(link);
    expect(fetch).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
    await finish(pending, json({ note: { id } }));
    expect(router.push).toHaveBeenCalledWith("/");
  });
  it("stays on the note when a save before navigation fails", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "Offline" }, 500));
    await mount();
    await fill(body(), "Keep draft");
    const link = document.createElement("a");
    link.href = "/";
    document.body.append(link);
    await click(link);
    expect(router.push).not.toHaveBeenCalled();
    expect(body().value).toBe("Keep draft");
  });
  it("requests unload protection while a save is pending, even if text was reverted", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(json({ note: { id } }));
    await mount();
    await fill(body(), "Temporary edit");
    await advance();
    await fill(body(), "Original body");
    const event = new Event("beforeunload", { cancelable: true });
    await act(async () => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    await finish(pending, json({ note: { id } }));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(status()).toBe("Saved");
  });
  it("flushes unsaved text on unmount and clears its timer", async () => {
    await mount();
    await fill(body(), "Final edit");
    await unmount();
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
