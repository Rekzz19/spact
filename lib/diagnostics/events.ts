export const diagnosticEvents = [
  "speech.request.started",
  "speech.response.received",
  "speech.audio.received",
  "speech.play.requested",
  "speech.play.started",
  "speech.context.state",
  "speech.decode.failed",
  "speech.play.retry",
  "speech.play.rejected",
  "speech.media.error",
  "speech.request.failed",
  "speech.ended",
  "speech.stopped",
  "history.failed",
] as const;
export type DiagnosticEvent = (typeof diagnosticEvents)[number];
export const numericFields = [
  "elapsedMs",
  "status",
  "bytes",
  "readyState",
  "networkState",
  "mediaErrorCode",
  "sinceGestureMs",
] as const;
export const booleanFields = [
  "paused",
  "muted",
  "userActive",
  "userHasBeenActive",
] as const;
export const stringFields = [
  "errorName",
  "errorMessage",
  "mimeType",
  "visibility",
  "stage",
  "engine",
  "contextState",
] as const;

export function safeDiagnosticString(value: string, max = 300) {
  return value
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/[\r\n\u0000-\u001f]/g, " ")
    .slice(0, max);
}
