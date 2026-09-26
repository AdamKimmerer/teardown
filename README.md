# Teardown

Narrate a competitor walkthrough, capture screenshots on demand, and get a structured document
that lands where your team works (HTML, Obsidian, Notion).

One repo, four deployables, one shared package:

```
packages/core/        shared Zod schemas, session clock, marker insertion, crop math, API contract
apps/api/             Hono HTTP API + pg-boss worker (Node)
apps/extension/       Chrome MV3 extension: side panel, content script, offscreen recorder
apps/web/             Vite + React web app
apps/landing/         static landing page, privacy, terms                                  (Phase 8)
supabase/migrations/  the schema; nothing else records it
docs/                 decisions log and spike results
```

## Run it locally in ten minutes

You need **Node 22** (`pg-boss` and `supabase-js` both require it; `brew install node@22`) and Git.

### 1. Install

```bash
corepack enable          # gives you pnpm at the version pinned in package.json
pnpm install
pnpm build               # compiles packages/core; the apps import it from dist/
pnpm test                # core tests must pass before anything else
```

### 2. Create a Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard). The free tier is fine.
2. **Authentication → Providers → Google**: enable it. (Client IDs come from Google Cloud; you can
   leave it enabled with placeholders until Phase 1.) Email is enabled by default; leave it on for
   the manual token test below.
3. **Project Settings → JWT Keys**: the project must use asymmetric signing keys (the default for
   new projects). If you see a legacy HS256 secret, click "Migrate JWT secret". The API verifies
   tokens against the project's JWKS endpoint and cannot verify HS256 tokens.

### 3. Apply the schema

Install the Supabase CLI (`brew install supabase/tap/supabase`), then from the repo root:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

`db push` applies `supabase/migrations/*.sql` in order. No Docker is needed for this; only
`supabase start` (a local Postgres) needs it, and nothing here uses that.

If you would rather not install the CLI, paste `supabase/migrations/0001_init.sql` into the
dashboard's SQL editor and run it. Do this only once; the CLI will not know it has been applied.

### 4. Configure and start the API

```bash
cp apps/api/.env.example apps/api/.env
# fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from Project Settings → API, and DATABASE_URL
# from Connect → "Session pooler" (not the direct db.<ref> host; it is IPv6-only, see .env.example)
pnpm --filter @teardown/api dev
```

`GET http://localhost:3000/health` returns `{"ok":true}`. On first start the API creates
pg-boss's own `pgboss` schema in the database; that is expected and not part of our migrations.

The worker is a second process from the same package:

```bash
pnpm --filter @teardown/api dev:worker
```

### 5. Check `GET /v1/me` with a real token

Every `/v1` route needs a Supabase access token. Until the web app exists, the quickest way to
get one is an email/password user:

1. Dashboard → **Authentication → Users → Add user**: an email, a password, and tick
   "Auto Confirm User". The `users` row is created by a trigger.
2. Exchange the password for a token (the anon key is under Project Settings → API):

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .access_token
```

3. Call the API with it:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/v1/me
```

Expected: `{"id":"…","email":"you@example.com","creditBalance":0,"connectors":[]}`.
Without a token: `401 {"error":{"code":"unauthenticated","message":"Missing bearer token"}}`.

### 6. Build and load the extension

```bash
cp apps/extension/.env.example apps/extension/.env   # same SUPABASE_URL and anon key as the API
pnpm --filter @teardown/extension build
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`.
Pin it; its icon opens the side panel. `pnpm --filter @teardown/extension dev` rebuilds on
| `pnpm --filter @teardown/web dev` | Web app on http://localhost:5173 with hot reload |
| `pnpm --filter @teardown/web build` | Typecheck and build the web app into `apps/web/dist` |
save (then click ↻ on the extension's card). The manifest's `key` pins the extension id to
`knphccpkdmgbckallojfoedobifonjop`, which the Google OAuth client's redirect URI depends on.

Google sign-in in the extension needs a **Web application** OAuth client in Google Cloud with
`https://knphccpkdmgbckallojfoedobifonjop.chromiumapp.org/` as an authorized redirect URI, its
client id in `apps/extension/manifest.json` (`oauth2.client_id`) and in Supabase → Auth →
Providers → Google → Authorized Client IDs (docs/decisions.md #15).

### 7. Run the web app

One-time setup so Google sign-in works in the browser (the extension's sign-in is separate):

1. **Google Cloud → APIs & Services → Credentials →** the _Web application_ client
   (`481084778132-3foptbk…`) → **Authorized redirect URIs** → add
   `https://<project-ref>.supabase.co/auth/v1/callback` → Save. Copy its **Client secret**.
2. **Supabase → Authentication → Sign In / Providers → Google**: paste that client secret (the
   client id is already there from the extension setup) → Save.
3. **Supabase → Authentication → URL Configuration**: Site URL `http://localhost:5173`, and add
   `http://localhost:5173/auth/callback` under Redirect URLs.

```bash
cp apps/web/.env.example apps/web/.env   # same Supabase URL and anon key; VITE_API_URL=http://localhost:3000
pnpm --filter @teardown/web dev          # http://localhost:5173
```

The API allows cross-origin requests from `WEB_APP_URL` only (default `http://localhost:5173`).

## Everyday commands

| Command                                                   | What it does                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm build`                                              | Build every package (core first; the apps depend on it)        |
| `pnpm test`                                               | Run every package's Vitest suite                               |
| `pnpm typecheck`                                          | `tsc --noEmit` in every package                                |
| `pnpm lint` / `pnpm format`                               | typescript-eslint recommended / Prettier defaults              |
| `pnpm --filter @teardown/api dev`                         | API with reload on save, reading `apps/api/.env`               |
| `pnpm --filter @teardown/api dev:worker`                  | The queue worker (transcription; later generation and exports) |
| `pnpm --filter @teardown/api fake-session`                | Phase 2 end-to-end check (see Manual test scripts)             |
| `pnpm --filter @teardown/api usage-events`                | Print the latest `usage_events` rows (what did this cost)      |
| `pnpm --filter @teardown/api recent-sessions`             | The last five sessions: captures, chunks, words, audio         |
| `pnpm --filter @teardown/api grant-credits --email <you>` | Add promo credits to an account (default 5)                    |
| `pnpm --filter @teardown/api generate-latest`             | Phase 4 end-to-end check on your latest stopped session        |
| `pnpm --filter @teardown/extension build`                 | Bundle the extension into `apps/extension/dist`                |
| `pnpm --filter @teardown/extension dev`                   | Same, rebuilding on save                                       |

After changing anything in `packages/core`, run `pnpm --filter @teardown/core build` so the apps
see it (or leave `pnpm --filter @teardown/core build --watch` running).

## Dependencies

Each runtime dependency, and what it is for. Add one only when it replaces more than ~100 lines.

| Package                        | Used by   | Why                                                                              |
| ------------------------------ | --------- | -------------------------------------------------------------------------------- |
| `zod`                          | all       | Schemas that are also the only source of TypeScript types                        |
| `hono`                         | api       | The HTTP router: routes, middleware, typed context                               |
| `@hono/node-server`            | api       | Runs a Hono app on Node's `http` server                                          |
| `jose`                         | api       | Verifies Supabase JWTs against the project's JWKS                                |
| `postgres`                     | api       | Postgres client (`postgres.js`); queries are hand-written SQL                    |
| `@supabase/supabase-js`        | api       | Storage client: signed upload/download URLs, object listing and delete           |
| `pg-boss`                      | api       | Postgres-backed job queue for the worker process                                 |
| `openai`                       | api       | OpenAI SDK: Whisper transcription now, vision models in Phase 4                  |
| `sharp`                        | api       | Crops region captures from originals; shrinks images to the model's patch budget |
| `@supabase/supabase-js`        | extension | Google sign-in (`signInWithIdToken`) and session refresh in the service worker   |
| `react`, `react-dom`           | web       | The UI library                                                                   |
| `react-router`                 | web       | URLs → pages (`src/router.tsx`)                                                  |
| `@tanstack/react-query`        | web       | Server state: fetching, caching, polling and invalidation of API data            |
| `react-markdown`, `remark-gfm` | web       | Renders documents (GitHub-flavoured Markdown: tables, lists) without raw HTML    |
| `@supabase/supabase-js`        | web       | Google sign-in and session refresh in the browser                                |

Dev: `typescript` 5.x (TypeScript 7 is not yet supported by `typescript-eslint`), `vitest`,
`tsx` (runs TypeScript directly in development), `eslint` + `typescript-eslint`, `prettier`.

## Manual test scripts

Steps to check by hand at the end of each phase. Automated tests cover only `packages/core`
and, later, the credit ledger and the Stripe webhook.

**Phase 0**

- [ ] `pnpm test` passes on a fresh clone.
- [ ] `GET /health` returns 200 with no token.
- [ ] `GET /v1/me` returns 401 with no token, a malformed header, or a garbage token.
- [ ] `GET /v1/me` with a real token returns the user with `creditBalance: 0`.
- [ ] Insert `(user_id, delta, reason) = (<id>, 5, 'promo')` into `credit_ledger` in the SQL editor;
      `GET /v1/me` now shows `creditBalance: 5`.

**Phase 2**

With the API and the worker both running, and the email/password user from Phase 0:

```bash
FAKE_EMAIL=you@example.com FAKE_PASSWORD=... pnpm --filter @teardown/api fake-session --delete
```

The script creates a session, uploads a spoken WAV (generated with macOS `say`) as one audio
chunk and three PNGs as captures through the real presign → PUT → register routes, stops the
session, waits for the worker, and prints the transcript with `[CAPTURE n]` markers.

- [ ] It ends with `captureCount = 3 ✓; wordCount = N ✓` and a transcript that reads like the
      narration, with `[CAPTURE 1]` near "capture this", `[CAPTURE 2]` near "capturing that
      too" and `[CAPTURE 3]` near "one more capture".
- [ ] With `--delete`, the last line reports `GET → 404; objects left in storage: 0; rows left: 0`.
- [ ] `pnpm --filter @teardown/api usage-events` shows one `transcribe` row with
      `audio_seconds` ≈ 33 and a cost estimate of about $0.003 (its `session_id` is null after
      `--delete`: usage rows outlive their session on purpose).
- [ ] Run it again without `--delete`, then delete the session's row from `sessions` in the
      dashboard: its captures, audio_chunks and transcript_words rows disappear (the cascade),
      but its storage objects remain — only the API's DELETE cleans those.
- [ ] `GET /v1/sessions/<someone else's id>` returns 404, not 403.

**Phase 3** — with the API and worker running and the extension loaded:

- [ ] Sign in with Google from the panel (a Google popup; it closes itself).
- [ ] First use: "Allow microphone" opens a tab; after allowing, the panel enables Start.
- [ ] Start on a competitor's site. The level meter moves when you talk; a small dark toolbar
      with a red dot appears bottom-centre of the page.
- [ ] Capture with the page button, the panel button, and ⌘⇧S. Each adds a thumbnail to the
      filmstrip within a second; the toolbar is never in the shot.
- [ ] Region: drag a box, capture — the thumbnail shows only the box. Scroll: the box stays.
      Clear removes it. Esc cancels a drag.
- [ ] Switch tabs and navigate; the toolbar follows you. On `chrome://` pages ⌘⇧S still
      captures (a plain viewport shot).
- [ ] Close the side panel mid-session, wait 30 s, reopen: the meter is still moving, the
      filmstrip is intact, and `pnpm --filter @teardown/api usage-events` keeps growing.
- [ ] Mute the mic for 10 s: the red "No sound" alarm appears; unmute: it goes.
- [ ] Stop. The Stop screen counts captures and words and gives the quality read; the word
      count settles within ~30 s. Delete a capture from the filmstrip (× on hover).
- [ ] Keep going → the meter returns; Stop again; the summary includes both stretches.
- [ ] Generate → until Phase 4 the panel says generation is not available yet.
- [ ] A 5-minute session on a real site ends with N captures and a transcript on the server:
      `GET /v1/sessions/:id/summary` matches what the panel showed.

**Phase 4** — with the API and worker running, after recording and stopping a session:

```bash
pnpm --filter @teardown/api grant-credits --email you@gmail.com
pnpm --filter @teardown/api generate-latest
```

- [ ] Status goes `syncing → processing → ready`; the document prints, and is saved to
      `apps/api/scripts/output/<session>-v1.md`.
- [ ] The image check line ends in ✓ (every `[IMAGE_n]` has an image; none repeated).
- [ ] The usage line shows the model, tokens, one `w×h` per image (none wider than ~2,000 px),
      and a cost of fractions of a cent.
- [ ] "contract-breaking refine → 422 … versions now 1 ✓" and "ordinary refine → 201 (version 2) ✓".
- [ ] Your balance went down by exactly one (`GET /v1/me`); the rejected refine and the kept one
      cost nothing.
- [ ] Generate from the extension's Stop screen: the panel clears and a tab opens at
      `localhost:5173/sessions/<id>`. With 0 credits it says "Out of credits" instead.

**Phase 5** — API, worker and web app running (`pnpm --filter @teardown/web dev`):

- [ ] `http://localhost:5173` sends you to Sign in; Google sign-in lands on Sessions.
- [ ] Record a session in the extension, Stop, Generate: the tab that opens shows "Finishing
      the transcript…" / "Writing your document…", then the document, without a reload.
- [ ] Signed out when the extension opens that tab? Signing in lands on that session, not the list.
- [ ] Every screenshot shows in the document; clicking one opens it full size.
- [ ] Refine ("shorten the summary"): "Saved as version 2"; the version picker shows v1 and v2;
      picking v1 shows the notice and hides the refine box.
- [ ] An impossible refine ("remove all the images", "compare with a product we didn't look
      at") shows the model's reason in the refine box, and no new version appears.
- [ ] Sessions list: title, date, capture count, status; Delete asks first, then the row goes.
- [ ] A session you discarded in the extension shows "Ready to generate" with a Generate button.
- [ ] Sign out in the web app does **not** sign the extension out (and vice versa).
- [ ] Account → Delete my account → type the phrase → you land on Sign in with "Your account
      and everything in it has been deleted." `pnpm --filter @teardown/api recent-sessions`
      shows none of your sessions, the extension asks you to sign in again, and the storage
      buckets have no folder for your old user id.
