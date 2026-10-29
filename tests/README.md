# Spact automated tests

Run these commands from `spact/`:

```sh
npm ci
npm test                   # All tests; no expected-failure wrappers
npm run test:api           # API handlers and server conversation/notes behavior
npm run test:ui            # Interactive pages/components plus page rendering checks
npm run test:known-issues  # Regression checks for the six previously known defects
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

## Resolved defects and regression checks

The six previously expected failures are now ordinary passing tests labelled
`[regression]`. The `knownIssue`/`it.fails` wrapper was removed. The existing
`test:known-issues` command remains available but now runs these normal regression
checks and should exit successfully.

| Previous defect                                | Correction                                                         | Test                             |
| ---------------------------------------------- | ------------------------------------------------------------------ | -------------------------------- |
| Invalid notes returned 500                     | A typed validation error maps to HTTP 400                          | `api/notes-write.test.ts`        |
| Set-password could create a guest on load      | Uses GET session lookup and rejects anonymous sessions             | `ui/auth.test.ts`                |
| Navigating away left the microphone running    | Stops active recorder and tracks; releases late permission streams | `ui/voice.test.ts`               |
| Unauthenticated callers could generate speech  | Checks the Supabase session before contacting Deepgram             | `api/service-boundaries.test.ts` |
| Unauthenticated callers could transcribe audio | Checks the Supabase session before contacting Deepgram             | `api/service-boundaries.test.ts` |
| TTS accepted non-string text                   | Validates nonblank string input before provider access             | `api/service-boundaries.test.ts` |

Authenticated anonymous users still have access to voice, chat history and notes.
Production speech diagnostics and Web Audio playback/fallback remain enabled.
