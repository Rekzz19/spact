import { type DiagnosticEvent, safeDiagnosticString } from "./events";

// Small batches: one request at playback start/failure, another at end/stop.
// Reporting is best-effort and must never block or change voice behavior.
export function createDiagnostics(attemptId = crypto.randomUUID()) {
  let events: Record<string, unknown>[] = [];
  const startedAt = performance.now();
  return {
    attemptId,
    record(
      event: DiagnosticEvent,
      fields: Record<string, unknown> = {},
      flush = false,
    ) {
      try {
        const error = fields.error;
        const { error: _error, ...details } = fields;
        void _error;
        events.push({
          ...details,
          event,
          elapsedMs: Math.round(performance.now() - startedAt),
          ...(error instanceof Error || error instanceof DOMException
            ? {
                errorName: error.name,
                errorMessage: safeDiagnosticString(error.message),
              }
            : {}),
        });
        if (!flush) return;
        const batch = events;
        events = [];
        void fetch("/api/diagnostics", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId,
            userAgent: navigator.userAgent.slice(0, 300),
            events: batch,
          }),
        }).catch(() => {});
      } catch {
        /* Diagnostics must never interrupt speech or restoration. */
      }
    },
  };
}

export function playbackDiagnostics(audio?: HTMLAudioElement) {
  return {
    visibility: document.visibilityState,
    userActive: navigator.userActivation?.isActive,
    userHasBeenActive: navigator.userActivation?.hasBeenActive,
    ...(audio
      ? {
          readyState: audio.readyState,
          networkState: audio.networkState,
          paused: audio.paused,
          muted: audio.muted,
          mediaErrorCode: audio.error?.code,
        }
      : {}),
  };
}
