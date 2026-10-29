# Spact automated tests

Run these commands from `spact/`:

```sh
npm ci
npm test                   # All regression checks, including labelled expected failures
npm run test:api           # API handlers and server conversation/notes behavior
npm run test:ui            # Interactive pages/components plus page rendering checks
npm run test:known-issues  # Strict defect reproduction: currently exits 1 with six failures
npx tsc --noEmit
```

The project already used Vitest. The only new development dependency is jsdom,
which supplies a DOM for React component tests. React's existing `act` and
`react-dom/client` exercise real components and browser events; no snapshots or
additional React test libraries are needed.

## Test boundaries

- **API tests (`tests/api`)** call the actual route handlers, using native Request /
  Response and multipart bodies. Supabase clients and external provider calls are
  mocked. Notes write tests run the real route and saveNote helper together.
  Inactivity tests use fake server time and an in-memory Supabase stand-in to
  verify rollover and preservation of old rows. They do **not** run PostgreSQL.
- **UI tests (`tests/ui`)** mount real React pages/components in jsdom, with real
  DOM input and click events. Next navigation, HTTP responses, microphone access,
  MediaRecorder, Audio, dialogs, layout measurements, and ResizeObserver are
  mocked. These verify state and event behavior, not pixel layout or real audio.
  Scroll assertions verify requested scroll position against supplied dimensions.
- **Page/helper tests (`tests/pages`)** cover HTML rendering, route redirection,
  and chat state transitions. The async note page is invoked directly with mocked
  Next request/navigation boundaries before rendering its returned element. This
  is not an end-to-end test of Next's Server Component pipeline.
- No test contacts a real Supabase, Nebius or Deepgram account. The shared setup
  rejects unexpected fetch calls. Supabase RLS, cookies across real browsers,
  email delivery, model quality, actual recording/playback, and responsive visual
  layout still require separately provisioned integration/browser tests. No
  production credentials or database changes are needed for this suite.

## Coverage added

- Rendering: `/`, `/home`, `/login`, `/register`, `/set-password`, the note detail
  page and its loading/error states, the legacy voice redirect, and root layout.
- Forms: successful and rejected login, input validation, double submission,
  registration confirmation/rate limiting, password mismatch, session check,
  password submission, and logout success/failure.
- Chat: first guest message, restored registered and anonymous history, oldest-
  first display, refresh without duplicates, empty/expired history, loading/errors,
  aborted restoration, account changes, immediate transcripts, server rollover,
  storage updates, and failures at transcription, chat and TTS boundaries.
- Recording: start/stop, microphone rejection, releasing tracks on stop, disabling
  repeat requests, and releasing audio URLs after playback rejection.
- Notes: title links, full content rendering, loading/empty/unauthorised/error
  states, retry, clearing stale links, save validation, authenticated anonymous
  saves, ownership checks, failed inserts and AI tool-call success/failure.
- Existing tests remain in place for 30-minute reuse, exact 90-minute and
  91-minute expiry, long active sessions, previous-row preservation, invalid IDs,
  missing conversations, and unauthorised API access.

## Known defects (not silently fixed)

These tests assert desired behavior and use `knownIssue` from `known-issues.ts`.
Normally this is Vitest's `it.fails`: a still-failing assertion counts as an
**expected failure**, not evidence that the behavior works. If a defect is fixed,
Vitest fails an unexpectedly passing expected-failure test; convert it to an
ordinary regression test as part of the fix. `test:known-issues` disables the
expected-failure wrapper so the actual assertions fail visibly.

| Desired behavior                                                          | Current observation                                                   | Reproduction test                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------- |
| Invalid note fields return 400                                            | `saveNote` rejects them, but POST maps the validation error to 500    | `api/notes-write.test.ts`        |
| Opening set-password checks the existing session without creating a user  | Page posts to `/api/auth/anonymous`, which can create a guest session | `ui/auth.test.ts`                |
| Navigating away during recording releases microphone tracks               | No unmount cleanup releases the active stream                         | `ui/voice.test.ts`               |
| Unauthenticated speech requests are blocked before provider access        | `/api/speak` calls Deepgram without a session check                   | `api/service-boundaries.test.ts` |
| Unauthenticated transcription requests are blocked before provider access | `/api/transcribe` calls Deepgram without a session check              | `api/service-boundaries.test.ts` |
| TTS validates text before provider access                                 | `/api/speak` forwards a non-string text value                         | `api/service-boundaries.test.ts` |

These are application defects or access-policy decisions needing follow-up; this
change deliberately modifies test infrastructure and tests only. Anonymous users
with a valid Supabase session are distinct from unauthenticated callers: guest
chat/history and note writing remain tested as supported behavior.
