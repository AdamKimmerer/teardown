# Decisions and verified facts

Where the build deviates from `Teardown v1 Build Plan` or `teardown-spine-v5.md`, or where a
library fact was checked at build time. Newest at the bottom. One entry per decision so each is
one line to revisit.

## Phase 0 (2026-09-19)

1. **JWT verification uses the project's JWKS, not `SUPABASE_JWT_SECRET`.** Supabase now signs
   new projects' tokens with asymmetric keys and marks the legacy HS256 secret "No longer
   recommended" (verified against supabase.com/docs/guides/auth/signing-keys). The middleware is
   `jose`'s `createRemoteJWKSet` + `jwtVerify` with issuer `<SUPABASE_URL>/auth/v1` and audience
   `authenticated`. Config needs only `SUPABASE_URL`. Same one-middleware shape as the plan.
2. **TypeScript pinned to 5.x.** TypeScript 7 (the native compiler) is current, but
   `typescript-eslint` declares `typescript <6.1`.
3. **pnpm 12** blocks dependency install scripts by default; `esbuild` is allow-listed in
   `pnpm-workspace.yaml`. pnpm also enforces a minimum release age; exceptions are listed there.
4. **Marker placement** (`core/markers.ts`): `[CAPTURE n]` goes in front of the first word whose
   `startMs >= tCapture`; captures after the last word go at the end. `n` is the capture's array
   position, so the generate job must pass captures sorted by `tCapture` and number images the
   same way.
5. **Crop math** (`core/crop.ts`) takes a fourth argument, the original's pixel bounds, and clamps
   the padded rect to it. The plan's signature had three.
6. **`users.deleted_at`** is kept from the plan's table list but is not a soft-delete flag: it is
   set while the delete-account cascade runs so a half-deleted account cannot act.
7. **Pack ids** are `pack_5` and `pack_15` (`core/schemas/credits.ts`), with credits and USD price
   in `PACKS`. Stripe Price IDs are API config.
8. **`POST /sessions` takes `startedAt` from the client** so the row carries the same epoch every
   extension runtime uses for the session clock. `POST /sessions/:id/stop` sends `stoppedAt` and
   the final `pausedMs` for the same reason.
9. **Presign responses carry `{ uploadUrl, token, path }`.** Supabase's `createSignedUploadUrl`
   returns a token alongside the URL; whether a raw `PUT` to the URL works without it is checked
   in Phase 1 spike (b).
10. **Storage buckets are created in `0001_init.sql`** (`insert into storage.buckets`) so the
    migration is the whole schema record, buckets included.
11. **Prettier defaults** mean double quotes and 80 columns; nothing is overridden.

## Phase 1 (2026-09-19)

12. **Microphone permission is requested from a full extension tab, as part of onboarding.**
    Chrome cannot show the permission bubble from a side panel, popup, or offscreen document
    (`getUserMedia` fails as if dismissed; confirmed by Chrome DevRel on the chromium-extensions
    list). Once granted from a tab, the offscreen document can use the mic. So first-run opens a
    permission page in a tab and treats it as the first onboarding step rather than a workaround.
13. **The offscreen document uses only `chrome.runtime` messaging.** No `chrome.storage`, no
    other extension API is available there. Anything it needs persisted goes through a message to
    the service worker.
14. **Presigns are always upsert.** Supabase signed upload URLs reject a second PUT to the same
    path with 409 unless the presign carried `x-upsert: true`; the API uses
    `createSignedUploadUrl(path, { upsert: true })` so client retries are idempotent.
15. **One Google OAuth client of type "Web application" serves both surfaces** (deviation from
    spine §18.5's "Chrome App type for the extension"). A "Chrome Extension" client only permits
    `getAuthToken`; `launchWebAuthFlow` needs a Web client with
    `https://<extension-id>.chromiumapp.org/` as an authorized redirect URI (Chrome team, on the
    chromium-extensions list). The same client also carries Supabase's
    `/auth/v1/callback` redirect for the web app, so there is one client id to keep in Supabase.
16. **Element pick is out of v1** (deviation from spine §8.2, which had three modes). Trying it
    in spike C showed it is not useful without the ancestor/semantic work the spine itself defers,
    so v1 ships viewport and freehand only. The `element` enum value and the `selectors` /
    `primary_element` columns stay in the schema so the mode has a home when diffing (§15) wants
    it; nothing in v1 writes them.
17. **The filmstrip shows the crop, the server keeps the original.** A capture is always the full
    viewport (spine §10.1); when a freehand region is set, the extension crops a _copy_ for the
    thumbnail so the user sees what they chose, and uploads the untouched original plus the rect.
18. **Hide-before-capture uses `display: none`** on the overlay host, two animation frames, and
    a short extra delay measured by spike C (`visibility: hidden` plus two frames was not enough
    on a real machine). There is no API to exclude an element from `captureVisibleTab`.

## Phase 2 (2026-09-19)

19. **`TRANSCRIBE_MODEL = "whisper-1"`** (§17 E resolved). It is the only OpenAI transcription
    model that returns word-level timestamps ("Use whisper-1 when you need word or segment
    timestamps", speech-to-text guide, 2026-09-19); the `gpt-*-transcribe` family does not.
    $0.006/min. 25 MB per request, which a 30 s chunk is nowhere near.
20. **Chunk overlap: the earlier chunk owns it.** Words from chunk N whose rebased start is before
    the end of the audio that came before it are dropped. The worker logs how many, so §17 N
    (boundary word-split rate) can be measured before deciding on a consolidating pass.
21. **Node 22 is required to run the API and worker**, not just to deploy them: `pg-boss` 12 and
    `supabase-js` 2.116 both refuse Node 20. `.nvmrc` already said 22.
22. **Presigned paths are enforced.** `POST .../captures` and `POST .../chunks` reject a record
    whose path is not exactly the key this API would have presigned for that id/offset, so a
    record can never point at another user's object.
23. **Worker retries are idempotent.** A re-run of `transcribe-chunk` deletes the chunk's words
    before inserting; `singletonKey` keeps a re-registered chunk from queuing twice; 3 retries
    with backoff for transient OpenAI errors.
24. **Ownership is a 404.** Every `/sessions/:id` route loads the session by id and user; an id
    that is not yours is indistinguishable from one that does not exist.

## Phase 3 (2026-09-21)

25. **`POST /sessions/:id/resume`** was added to the API contract for the Stop screen's "keep
    going" (spine §7, §11 step 4); the build plan's endpoint list did not have one. `review` →
    `recording`, with the stopped stretch folded into `paused_ms`.
26. **The panel is plain TypeScript + DOM, no React.** Five small views; React would be the
    extension's largest dependency and the extension goes through Web Store review. React stays
    in the web app.
27. **Audio chunks are separate `MediaRecorder` runs, alternating with a 1 s overlap** (20 s
    each). A single recorder with a timeslice produces header-less fragments Whisper cannot
    read; each chunk here is a complete `.webm`.
28. **The content script does not parse messages with Zod** (exception to convention 9). Zod 4
    is 450 KB minified and the content script is injected into recorded pages; it receives two
    trivial message shapes, checked by hand, and everything it sends is Zod-parsed by the
    worker. Every other runtime uses the Zod union.
29. **Auth lives in the service worker only.** One Supabase client, in one runtime; the panel
    asks the worker to sign in, sign out, and for state. Two clients refreshing the same token
    would race.
30. **`alarms` permission** joined the manifest for the forgot-to-stop nudge; a service worker
    cannot hold a 25-minute timer.
31. **Recovery rules** (service worker start): a `recording` session with no clock in
    `chrome.storage.session` means the browser restarted, so it becomes `review` locally and on
    the server; a `recording` session with no offscreen document gets its recorder restarted;
    anything in IndexedDB not marked uploaded is re-queued.
