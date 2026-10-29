// @vitest-environment jsdom
import { knownIssue } from "../known-issues";
import {
  render,
  unmount,
  button,
  click,
  json,
  deferred,
  finish,
  text,
} from "./helpers";
import { act, createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VoicePage from "@/app/page";

const id = "11111111-1111-4111-8111-111111111111";
const newId = "22222222-2222-4222-8222-222222222222";
const userId = "user-1";
const userMessage = {
  id: 1,
  role: "user",
  content: "Earlier question",
  created_at: "2026-10-28T12:00:00Z",
};
const assistantMessage = {
  id: 2,
  role: "assistant",
  content: "Earlier response",
  created_at: "2026-10-28T12:00:01Z",
};
const stopTrack = vi.fn();
const getUserMedia = vi.fn();
const play = vi.fn();
const revokeObjectURL = vi.fn();
let session: { userId: string; anonymous?: boolean } | null;
let history: object;
let transcriptResponse: () => Promise<Response>;
let chatResponse: () => Promise<Response>;
let speechResponse: () => Promise<Response>;

class Recorder {
  static last: Recorder;
  mimeType = "audio/webm";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => Promise<void>;
  completion?: Promise<void>;
  start = vi.fn();
  stop = vi.fn(() => {
    this.ondataavailable?.({
      data: new Blob(["recorded-audio"], { type: this.mimeType }),
    });
    this.completion = this.onstop?.();
  });
  constructor() {
    Recorder.last = this;
  }
}

beforeEach(() => {
  session = { userId };
  history = { active: true, userId, messages: [userMessage, assistantMessage] };
  transcriptResponse = async () => json({ transcript: "New transcript" });
  chatResponse = async () =>
    json({ reply: "New response", conversationId: id, userId });
  speechResponse = async () =>
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  stopTrack.mockReset();
  getUserMedia
    .mockReset()
    .mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  play.mockReset().mockResolvedValue(undefined);
  revokeObjectURL.mockReset();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal(
    "Audio",
    class {
      onended?: () => void;
      play = play;
    },
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:test-audio"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
  vi.mocked(fetch).mockImplementation(async (url) => {
    const path = String(url);
    if (path === "/api/auth/session")
      return session
        ? json({ authenticated: true, ...session })
        : json({ authenticated: false }, 401);
    if (path.includes("/messages?activeOnly=true")) return json(history);
    if (path === "/api/auth/anonymous") return json({ userId: "guest-1" });
    if (path === "/api/superbase-conversations")
      return json({ conversationId: id }, 201);
    if (path === "/api/transcribe") return transcriptResponse();
    if (path === "/api/chat") return chatResponse();
    if (path === "/api/speak") return speechResponse();
    throw new Error(`Unexpected request: ${path}`);
  });
});

async function recordAndSend() {
  await click(button("Start Recording"));
  await click(button("Stop Recording"));
  await act(async () => {
    await Recorder.last.completion;
  });
}
const log = () => document.querySelector('[role="log"]');
const callsTo = (path: string) =>
  vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === path);

describe("Voice page restoration (real components, mocked HTTP/browser media)", () => {
  it("renders the default screen without creating a user or conversation on load", async () => {
    session = null;
    await render(createElement(VoicePage));
    expect(document.querySelector("h1")?.textContent).toBe("Spact");
    expect(button("Start Recording").disabled).toBe(false);
    expect(log()).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(callsTo("/api/auth/anonymous")).toHaveLength(0);
    expect(callsTo("/api/superbase-conversations")).toHaveLength(0);
  });
  it("restores chronological history once using the current user's stored ID", async () => {
    sessionStorage.setItem(`conversationId:${userId}`, id);
    sessionStorage.setItem("conversationId:other-user", "wrong-conversation");
    await render(createElement(VoicePage));
    expect(log()?.textContent).toContain("Earlier question");
    expect(log()?.textContent?.indexOf("Earlier question")).toBeLessThan(
      log()?.textContent?.indexOf("Earlier response") ?? 0,
    );
    expect(log()?.querySelectorAll("article")).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(callsTo("/api/superbase-conversations")).toHaveLength(0);
    await unmount();
    await render(createElement(VoicePage));
    expect(log()?.querySelectorAll("article")).toHaveLength(2);
  });
  it("restores anonymous history with the same endpoint", async () => {
    session = { userId: "guest-1", anonymous: true };
    history = { active: true, userId: "guest-1", messages: [userMessage] };
    sessionStorage.setItem("conversationId:guest-1", id);
    await render(createElement(VoicePage));
    expect(log()?.textContent).toContain("Earlier question");
    expect(callsTo("/api/auth/anonymous")).toHaveLength(0);
  });
  it.each([
    { active: false, messages: [] },
    { active: true, messages: [] },
  ])(
    "retains the default screen for expired or empty history (%j)",
    async (result) => {
      sessionStorage.setItem(`conversationId:${userId}`, id);
      history = { ...result, userId };
      await render(createElement(VoicePage));
      expect(log()).toBeNull();
      expect(button("Start Recording")).not.toBeNull();
      expect(sessionStorage.getItem(`conversationId:${userId}`)).toBe(id);
      expect(callsTo("/api/superbase-conversations")).toHaveLength(0);
    },
  );
  it("disables recording while history is loading", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    await render(createElement(VoicePage));
    expect(text()).toContain("Restoring your conversation");
    expect(button("Start Recording").disabled).toBe(true);
    await finish(pending, json({ authenticated: true, userId }));
  });
  it("discards a late history response when the page has unmounted", async () => {
    sessionStorage.setItem(`conversationId:${userId}`, id);
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes("/messages?")
        ? pending.promise
        : json({ authenticated: true, userId }),
    );
    await render(createElement(VoicePage));
    const historyCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/messages?"));
    const signal = (historyCall?.[1] as RequestInit).signal!;
    await unmount();
    expect(signal.aborted).toBe(true);
    await finish(pending, json(history));
    expect(document.body.textContent).toBe("");
  });
  it("clears prior-user messages when the session changes on focus", async () => {
    sessionStorage.setItem(`conversationId:${userId}`, id);
    await render(createElement(VoicePage));
    expect(log()).not.toBeNull();
    session = { userId: "user-2" };
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(log()).toBeNull();
    expect(text()).not.toContain("Earlier question");
  });
  it("shows retryable restoration errors without creating a conversation", async () => {
    sessionStorage.setItem(`conversationId:${userId}`, id);
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes("/messages?")
        ? json({ error: "History unavailable" }, 500)
        : json({ authenticated: true, userId }),
    );
    await render(createElement(VoicePage));
    expect(text()).toContain("History unavailable");
    expect(button("Try again")).not.toBeNull();
    expect(callsTo("/api/superbase-conversations")).toHaveLength(0);
  });
});

describe("Recording, transcription, chat and playback controls", () => {
  it("records a first guest message, displays both speakers, and plays speech", async () => {
    session = null;
    chatResponse = async () =>
      json({ reply: "New response", conversationId: id, userId: "guest-1" });
    await render(createElement(VoicePage));
    await recordAndSend();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(log()?.querySelectorAll("article")).toHaveLength(2);
    expect(log()?.textContent).toContain("New transcript");
    expect(log()?.textContent).toContain("New response");
    expect(sessionStorage.getItem("conversationId:guest-1")).toBe(id);
    expect(callsTo("/api/chat")[0][1]?.body).toBe(
      JSON.stringify({ transcript: "New transcript", conversationId: id }),
    );
    expect(play).toHaveBeenCalledOnce();
    expect(button("Start Recording").disabled).toBe(false);
  });
  it("shows a transcript before the AI response arrives and blocks repeat submissions", async () => {
    const pending = deferred<Response>();
    chatResponse = () => pending.promise;
    await render(createElement(VoicePage));
    await click(button("Start Recording"));
    await click(button("Stop Recording"));
    expect(log()?.querySelectorAll("article")).toHaveLength(1);
    expect(log()?.textContent).toContain("New transcript");
    expect(text()).toContain("Waiting for Spact");
    expect(button("Transcribing...").disabled).toBe(true);
    await finish(
      pending,
      json({ reply: "New response", conversationId: id, userId }),
    );
    await act(async () => {
      await Recorder.last.completion;
    });
    expect(log()?.querySelectorAll("article")).toHaveLength(2);
  });
  it("clears old chat and updates sessionStorage when the server rolls over an expired conversation", async () => {
    sessionStorage.setItem(`conversationId:${userId}`, id);
    chatResponse = async () =>
      json({ reply: "New response", conversationId: newId, userId });
    await render(createElement(VoicePage));
    await recordAndSend();
    expect(log()?.querySelectorAll("article")).toHaveLength(2);
    expect(text()).not.toContain("Earlier question");
    expect(text()).toContain("New transcript");
    expect(sessionStorage.getItem(`conversationId:${userId}`)).toBe(newId);
  });
  it("reports microphone rejection without sending API requests", async () => {
    getUserMedia.mockRejectedValue(new Error("Denied"));
    await render(createElement(VoicePage));
    await click(button("Start Recording"));
    expect(text()).toContain("Microphone access failed");
    expect(callsTo("/api/transcribe")).toHaveLength(0);
  });
  it("stops after transcription failure without calling chat or speech", async () => {
    transcriptResponse = async () =>
      json({ error: "Transcription unavailable" }, 502);
    await render(createElement(VoicePage));
    await recordAndSend();
    expect(text()).toContain("Transcription unavailable");
    expect(callsTo("/api/chat")).toHaveLength(0);
    expect(callsTo("/api/speak")).toHaveLength(0);
    expect(stopTrack).toHaveBeenCalledOnce();
  });
  it("shows a failed chat message without claiming it was saved", async () => {
    chatResponse = async () => json({ error: "Chat unavailable" }, 502);
    await render(createElement(VoicePage));
    await recordAndSend();
    expect(text()).toContain("Chat unavailable");
    expect(text()).toContain("Message could not be saved");
    expect(callsTo("/api/speak")).toHaveLength(0);
  });
  it("preserves saved chat when TTS fails", async () => {
    speechResponse = async () => json({ error: "Provider error" }, 502);
    await render(createElement(VoicePage));
    await recordAndSend();
    expect(log()?.querySelectorAll("article")).toHaveLength(2);
    expect(text()).toContain("Speech generation failed");
    expect(text()).not.toContain("Message could not be saved");
    expect(play).not.toHaveBeenCalled();
  });
  it("clears messages after a chat response indicates the authenticated user changed", async () => {
    sessionStorage.setItem(`conversationId:${userId}`, id);
    chatResponse = async () =>
      json({
        reply: "Private other-user response",
        conversationId: newId,
        userId: "user-2",
      });
    await render(createElement(VoicePage));
    await recordAndSend();
    expect(log()).toBeNull();
    expect(text()).not.toContain("Private other-user response");
    expect(text()).toContain("Your session changed");
    expect(sessionStorage.getItem("conversationId:user-2")).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
  it("revokes the audio object URL after playback rejection", async () => {
    play.mockRejectedValue(new Error("Playback denied"));
    await render(createElement(VoicePage));
    await recordAndSend();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-audio");
    expect(text()).toContain("Playback denied");
  });
  knownIssue(
    "[known defect] leaving the page while recording should release microphone tracks",
    async () => {
      await render(createElement(VoicePage));
      await click(button("Start Recording"));
      await unmount();
      expect(stopTrack).toHaveBeenCalledOnce();
    },
  );
});
