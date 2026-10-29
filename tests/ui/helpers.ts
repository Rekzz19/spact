import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
export { router };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
}));
// Next's router is outside this component-test boundary; links retain real hrefs.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => createElement("a", { ...props, href }, children),
}));

let root: Root | null = null;
let container: HTMLDivElement;
export const matchMedia = vi.fn();

beforeEach(() => {
  // jsdom 26 does not implement Blob.arrayBuffer(). Node 24's Response.blob()
  // can use that DOM Blob, unlike older Node versions. Supply the browser API
  // through FileReader rather than letting Web Audio tests hit HTML fallback.
  if (typeof Blob.prototype.arrayBuffer !== "function") {
    Object.defineProperty(Blob.prototype, "arrayBuffer", {
      configurable: true,
      value: function (this: Blob): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      },
    });
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  localStorage.clear();
  matchMedia.mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

export async function render(element: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}
export async function unmount() {
  if (root) await act(async () => root!.unmount());
  root = null;
}
export function button(name: string): HTMLButtonElement {
  const result = Array.from(document.querySelectorAll("button")).find(
    (item) =>
      item.getAttribute("aria-label") === name ||
      item.textContent?.trim() === name,
  );
  if (!result) throw new Error(`Button not found: ${name}`);
  return result;
}
export function input(label: string): HTMLInputElement {
  const element = Array.from(document.querySelectorAll("label")).find(
    (item) => item.textContent?.trim() === label,
  );
  const result = element?.control;
  if (!(result instanceof HTMLInputElement))
    throw new Error(`Input not found: ${label}`);
  return result;
}
export async function fill(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
export async function click(element: HTMLElement) {
  await act(async () => element.click());
}
export async function submit() {
  const form = document.querySelector("form");
  if (!form) throw new Error("Form not found");
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function finish<T>(
  pending: ReturnType<typeof deferred<T>>,
  value: T,
) {
  await act(async () => pending.resolve(value));
}
export function text() {
  return document.body.textContent ?? "";
}
