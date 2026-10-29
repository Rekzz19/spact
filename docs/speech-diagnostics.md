# Production speech diagnostics

This instrumentation diagnoses speech failures; it does not change Safari's
playback policy, the audio format, or Spact's playback flow.

## Reproduce on Vercel

1. Deploy these changes to the production deployment.
2. Open the deployed URL on the affected iPhone and send a recording normally.
3. Open the project's **Logs** tab in Vercel, select **Production**, and include
   Info as well as Error logs. Search for `spact.browser` or `spact.server`.
4. Find the entry at the time of the attempt. Copy its `attemptId` and search for
   that value to connect `/api/speak` and `/api/diagnostics` requests. Vercel's own
   per-request ID is different from Spact's cross-request speech attempt ID.
5. Compare an iPhone failure with a successful Mac attempt. Capture the exact
   browser/iOS version if the user-agent string does not identify it sufficiently.

## Server observations

`/api/speak` logs structured JSON with `source: "spact.server"`:

- `speech.request.started`: server received the speech attempt.
- `deepgram.response`: HTTP status, content type, optional Content-Length,
  Deepgram's `dg-request-id`, and time to response headers.
- `speech.request.failed`: request/parsing/network failure with an error name
  and bounded message.

`X-Spact-Speech-Id` carries the attempt ID between the browser and speech route.
The server generates one if the incoming ID is absent or malformed. Logs also
include the short Vercel Git commit SHA when available. A provider 200 indicates
response headers arrived; browser audio receipt is the evidence for a completed
body download.

## Browser observations

The browser sends small best-effort batches to `/api/diagnostics`; that endpoint
writes JSON with `source: "spact.browser"` to Vercel runtime logs. Client console
output alone would not reach those server logs.

The first batch is sent when playback starts, is rejected, or a speech request
fails. It contains the preceding request, response, Blob, and playback events.
An additional batch records natural completion, Stop speaking, playback errors,
or stopping existing audio when leaving the page or replacing playback.

Useful fields:

- `speech.audio.received`: actual downloaded Blob `bytes` and `mimeType`.
- `speech.play.requested`: elapsed time since Stop Recording, document visibility,
  and transient/sticky user activation when the browser exposes those fields.
- `speech.play.started`: actual `playing` event.
- `speech.play.rejected`: exception name/message and media state.
- `speech.media.error`: the media error code/message after creating the player.
- `speech.ended` / `speech.stopped`: natural completion or application stop.
- `history.failed`: restoration failed at `session_fetch`, `storage_read`, or
  `messages_fetch`. The exact stage disambiguates history errors from playback.

`elapsedMs` is relative to the beginning of that process: client and server
clocks are not directly comparable. `sinceGestureMs` is relative to the user's
Stop Recording click. `userActive` is supporting evidence, not a guarantee that
playback is permitted or denied.

## Interpret a failure

| Evidence                                          | Investigate                                                    |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Deepgram non-200                                  | Provider request, quota, credentials, or provider availability |
| Deepgram 200 followed by browser download failure | Transfer/network interruption                                  |
| Unexpected MIME type or empty audio Blob          | Provider response/audio format                                 |
| Audio received then `NotAllowedError` from play   | Browser/platform playback permission policy                    |
| `NotSupportedError` or media decoding error       | Audio format/decoding                                          |
| `playing` event followed by a media error         | Failure after playback began                                   |
| History failure at `storage_read`                 | Browser sessionStorage access                                  |

If no browser report arrives, inspect the `/api/diagnostics` HTTP status before
concluding that playback was never attempted. Collection requires an existing
Supabase session, including anonymous sessions. Network failure, navigation,
privacy tools, or expired cookies can prevent collection. Telemetry is best-effort
and not guaranteed delivery; it intentionally has no retry loop that could affect
voice behavior.

## Limits and data handling

- No transcript, generated response text, audio bytes, API keys, cookies, or user
  IDs are included in diagnostic payloads.
- Raw transcript and raw model-response debug logs now run only in development.
- Reports accept only known event names and selected bounded fields. URLs and
  control characters are stripped from string fields. The body is capped at
  12,000 bytes and 12 events; mismatched Origin headers are rejected.
- Client observations are untrusted, authenticated reports; they are not proof
  that a provider request succeeded.
- Browser reports currently use Info-level logs, including reported playback
  errors. Deepgram failures use Error-level server logs, so include both levels.
- This does not fix the separately documented missing auth checks on the existing
  speech/transcription routes.

## Checks

```sh
npm test -- tests/api/diagnostics.test.ts tests/api/speak.test.ts tests/ui/voice.test.ts
npx tsc --noEmit
```

These tests mock Supabase, provider HTTP, and browser audio. Actual iPhone/Safari
playback and production log delivery must be verified after deployment.
