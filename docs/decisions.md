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
