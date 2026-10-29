import {
  createDiagnostics,
  playbackDiagnostics,
} from "@/lib/diagnostics/client";
type Diagnostics = ReturnType<typeof createDiagnostics>;
type State = "idle" | "speaking" | "blocked";

// One player/context for a mounted voice page. A new source node is required for
// each utterance, but the gesture-activated AudioContext is deliberately reused.
export class SpeechPlayer {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private diagnostics: Diagnostics | null = null;
  private generation = 0;
  private disposed = false;
  private speaking = false;
  private retrying = false;

  constructor(
    private state: (state: State) => void,
    private onError: (message: string) => void,
  ) {}

  // Call directly from click handlers, before getUserMedia/fetch/any await.
  unlock() {
    if (this.disposed) return;
    try {
      const Context =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Context) return;
      if (!this.context || this.context.state === "closed") {
        this.context = new Context();
        this.context.onstatechange = () => {
          const context = this.context;
          if (!context || this.disposed) return;
          this.diagnostics?.record(
            "speech.context.state",
            { contextState: context.state, engine: "webaudio" },
            true,
          );
          if (context.state !== "running" && this.speaking) {
            this.stopSource();
            this.speaking = false;
            this.state("blocked");
          }
        };
      }
      if (this.context.state !== "running") {
        // Start resume synchronously; do not keep the recording waiting on it.
        void this.context.resume().catch(() => {});
      }
    } catch {
      // Unsupported/broken context construction can still use HTML audio.
      this.context = null;
    }
  }

  async play(blob: Blob, diagnostics: Diagnostics, sinceGestureMs: number) {
    this.stop();
    if (this.disposed) return;
    const generation = this.generation;
    this.diagnostics = diagnostics;
    if (this.context) {
      try {
        const bytes = await blob.arrayBuffer();
        const buffer = await this.context.decodeAudioData(bytes);
        if (generation !== this.generation || this.disposed) return;
        this.buffer = buffer;
        diagnostics.record("speech.play.requested", {
          ...playbackDiagnostics(),
          sinceGestureMs,
          engine: "webaudio",
          contextState: this.context.state,
        });
        if (this.context.state !== "running") {
          this.blocked(
            new DOMException(
              "Audio context needs a user interaction to resume.",
              "NotAllowedError",
            ),
          );
          return;
        }
        this.startBuffer();
      } catch (error) {
        if (generation !== this.generation || this.disposed) return;
        diagnostics.record(
          "speech.decode.failed",
          { error, engine: "webaudio" },
          true,
        );
        // Retain a directly playable MP3 fallback if decoding is unavailable.
        await this.playHtml(blob, generation);
      }
    } else {
      await this.playHtml(blob, generation, sinceGestureMs);
    }
  }

  private startBuffer() {
    const context = this.context;
    if (!context || !this.buffer || this.disposed) return;
    this.stopSource();
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(context.destination);
    this.source = source;
    source.onended = () => {
      if (this.source !== source) return;
      this.diagnostics?.record(
        "speech.ended",
        { engine: "webaudio", contextState: context.state },
        true,
      );
      this.stop(false);
    };
    source.start();
    this.speaking = true;
    this.state("speaking");
    this.diagnostics?.record(
      "speech.play.started",
      {
        ...playbackDiagnostics(),
        engine: "webaudio",
        contextState: context.state,
      },
      true,
    );
  }

  private async playHtml(
    blob: Blob,
    generation: number,
    sinceGestureMs?: number,
  ) {
    if (generation !== this.generation || this.disposed) return;
    this.url = URL.createObjectURL(blob);
    const audio = new Audio(this.url);
    this.audio = audio;
    audio.onplaying = () => {
      if (this.audio !== audio) return;
      this.speaking = true;
      this.state("speaking");
      this.diagnostics?.record(
        "speech.play.started",
        { ...playbackDiagnostics(audio), engine: "htmlaudio" },
        true,
      );
    };
    audio.onended = () => {
      if (this.audio !== audio) return;
      this.diagnostics?.record(
        "speech.ended",
        { ...playbackDiagnostics(audio), engine: "htmlaudio" },
        true,
      );
      this.stop(false);
    };
    audio.onerror = () => {
      if (this.audio !== audio) return;
      this.diagnostics?.record(
        "speech.media.error",
        {
          ...playbackDiagnostics(audio),
          errorMessage: audio.error?.message,
          engine: "htmlaudio",
        },
        true,
      );
      this.stop(false);
      this.onError("Speech playback failed. Please try again.");
    };
    this.diagnostics?.record("speech.play.requested", {
      ...playbackDiagnostics(audio),
      sinceGestureMs,
      engine: "htmlaudio",
    });
    await this.tryHtmlPlay(audio);
  }

  private async tryHtmlPlay(audio: HTMLAudioElement) {
    try {
      // The call itself is synchronous when reached through the Play response tap.
      await audio.play();
    } catch (error) {
      if (this.audio !== audio || this.disposed) return;
      if (
        (error instanceof DOMException && error.name === "NotAllowedError") ||
        (error instanceof Error && error.name === "NotAllowedError")
      ) {
        this.blocked(error);
      } else {
        this.diagnostics?.record(
          "speech.play.rejected",
          { ...playbackDiagnostics(audio), error, engine: "htmlaudio" },
          true,
        );
        this.stop(false);
        throw error;
      }
    }
  }

  private blocked(error: unknown) {
    this.speaking = false;
    this.state("blocked");
    this.diagnostics?.record(
      "speech.play.rejected",
      {
        ...playbackDiagnostics(this.audio ?? undefined),
        error,
        engine: this.audio ? "htmlaudio" : "webaudio",
        contextState: this.context?.state,
      },
      true,
    );
  }

  // Called directly from a user gesture; never refetches or regenerates audio.
  retry() {
    if (this.retrying || this.disposed) return Promise.resolve();
    this.retrying = true;
    return this.retryPlayback().finally(() => {
      this.retrying = false;
    });
  }

  private async retryPlayback() {
    if (this.disposed) return;
    const generation = this.generation;
    this.diagnostics?.record("speech.play.retry", playbackDiagnostics());
    if (this.audio) {
      await this.tryHtmlPlay(this.audio);
      return;
    }
    const context = this.context;
    if (!context || !this.buffer) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Bound resume: iOS can leave a resume promise pending during interruption.
      await Promise.race([
        context.resume(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new DOMException(
                  "Audio is still suspended. Tap Play response to retry.",
                  "NotAllowedError",
                ),
              ),
            2000,
          );
        }),
      ]);
      if (generation !== this.generation || this.disposed) return;
      if (context.state !== "running")
        throw new DOMException("Audio is still suspended.", "NotAllowedError");
      this.startBuffer();
    } catch (error) {
      if (generation === this.generation && !this.disposed) this.blocked(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private stopSource() {
    if (!this.source) return;
    this.source.onended = null;
    try {
      this.source.stop();
    } catch {
      /* Already ended. */
    }
    this.source.disconnect();
    this.source = null;
  }

  stop(report = true) {
    this.generation++;
    if (report && (this.audio || this.source || this.buffer))
      this.diagnostics?.record(
        "speech.stopped",
        { engine: this.audio ? "htmlaudio" : "webaudio" },
        true,
      );
    this.stopSource();
    if (this.audio) {
      this.audio.onplaying = this.audio.onended = this.audio.onerror = null;
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.audio = null;
    this.url = null;
    this.buffer = null;
    this.diagnostics = null;
    this.speaking = false;
    if (!this.disposed) this.state("idle");
  }

  dispose() {
    this.disposed = true;
    this.stop();
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => {});
      this.context = null;
    }
  }
}
