# Teardown

Narrate a competitor walkthrough, capture screenshots on demand, and get a structured document
that lands where your team works.

One repo, four deployables, one shared package:

```
packages/core/        shared Zod schemas, API contract, session clock, markers, crop math, output contract
apps/api/             Hono HTTP API + pg-boss worker (Node 22)
apps/extension/       Chrome MV3 extension: side panel, content script, offscreen recorder
apps/web/             Vite + React web app
apps/landing/         static landing page, privacy, terms                                  (Phase 8)
supabase/migrations/  the schema; nothing else records it
docs/                 spine (product + architecture), build plan, status, decisions, backlog
```

**New here?** Start with [docs/README.md](docs/README.md): it lists the documents and the order to
read them in. This file covers setup, commands, dependencies and the manual test scripts.

## Run it locally

You need **Node 22** (`pg-boss` and `supabase-js` both require it) and Git. With `fnm` or `nvm`,
`.nvmrc` selects it.

### 1. Install

```bash
corepack enable          # gives you pnpm at the version pinned in package.json
pnpm install
pnpm build               # compiles packages/core; the apps import it from dist/
pnpm test                # core tests must pass before anything else
```

### 2. Create a Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard). The free tier is
   fine.
2. **Project Settings → JWT Keys**: the project must use asymmetric signing keys (the default for
   new projects). If you see a legacy HS256 secret, click "Migrate JWT secret". The API verifies
   tokens against the project's JWKS endpoint and cannot verify HS256 tokens.

### 3. Set up Google sign-in

One Google OAuth client serves both the extension and the web app.

1. **Google Cloud → APIs & Services → Credentials → Create OAuth client**, type **Web
   application**. Authorized redirect URIs:
   - `https://knphccpkdmgbckallojfoedobifonjop.chromiumapp.org/` (the extension; the id is
     pinned by the manifest's `key`)
   - `https://<project-ref>.supabase.co/auth/v1/callback` (the web app)

   Redirect URI changes take a few minutes to reach Google's servers; until then sign-in fails
   with `redirect_uri_mismatch`.

2. **Supabase → Authentication → Sign In / Providers → Google**: enable it, paste the client id
   and client secret, and add the same client id under **Authorized Client IDs** (the extension
   signs in with a Google ID token).
3. **Supabase → Authentication → URL Configuration**: Site URL `http://localhost:5173`, and
   `http://localhost:5173/auth/callback` under Redirect URLs.
4. Put the client id in `apps/extension/manifest.json` → `oauth2.client_id`.

### 4. Create the `.env` files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/extension/.env.example apps/extension/.env
cp apps/web/.env.example apps/web/.env
```

- `apps/api/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` from
  Project Settings → API; `DATABASE_URL` from **Connect → Session pooler** (the direct
  `db.<ref>` host is IPv6-only and fails with `ENOTFOUND` on IPv4-only networks);
  `OPENAI_API_KEY`; `WEB_APP_URL=http://localhost:5173`.
- `apps/extension/.env` and `apps/web/.env`: the same Supabase URL and anon key, the API URL
  (`http://localhost:3000`) and, for the extension, the web app URL. None of these are secrets.

### 5. Apply the schema

From the repo root (nothing to install or link; no Docker):

```bash
npx supabase@latest db push --db-url "$(grep '^DATABASE_URL=' apps/api/.env | cut -d= -f2-)" --dry-run
```

Drop `--dry-run` to apply. This runs `supabase/migrations/*.sql` in order and records them, so
later runs apply only new files.

### 6. Start the API, worker and web app

Three terminals, from the repo root:

```bash
pnpm --filter @teardown/api dev          # http://localhost:3000
pnpm --filter @teardown/api dev:worker   # the queue worker
pnpm --filter @teardown/web dev          # http://localhost:5173
```

`GET http://localhost:3000/health` returns `{"ok":true}`. On first start the API creates
pg-boss's own `pgboss` schema in the database; that is expected and not part of our migrations.
The API allows cross-origin requests from `WEB_APP_URL` only.

### 7. Build and load the extension

```bash
pnpm --filter @teardown/extension build   # or `dev` to rebuild on save
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`. Pin
it; its icon opens the side panel. After a rebuild, click ↻ on the extension's card.

Open `http://localhost:5173` and sign in with Google; you should land on an empty Sessions list.
New accounts have no credits: `pnpm --filter @teardown/api grant-credits --email <you>`.

### Calling the API directly

Every `/v1` route needs a Supabase access token. For a quick check without the web app, create
an email/password user (Dashboard → Authentication → Users → Add user, tick "Auto Confirm User";
the Email provider must be enabled), then:

```bash
TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/v1/me
```

Expected: `{"id":"…","email":"you@example.com","creditBalance":0,"connectors":[]}`. Without a
token: `401 {"error":{"code":"unauthenticated","message":"Missing bearer token"}}`. The dev
scripts below can also act as a Google-account user with `--email`, without a password.

## Everyday commands

| Command                                                   | What it does                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm build`                                              | Build every package (core first; the apps depend on it)       |
| `pnpm test`                                               | Run every package's Vitest suite                              |
| `pnpm typecheck`                                          | `tsc --noEmit` in every package                               |
| `pnpm lint` / `pnpm format`                               | typescript-eslint recommended / Prettier defaults             |
| `pnpm --filter @teardown/api dev`                         | API with reload on save, reading `apps/api/.env`              |
| `pnpm --filter @teardown/api dev:worker`                  | The queue worker: transcription and generation                |
| `pnpm --filter @teardown/web dev`                         | Web app on http://localhost:5173 with hot reload              |
| `pnpm --filter @teardown/web build`                       | Typecheck and build the web app into `apps/web/dist`          |
| `pnpm --filter @teardown/extension build`                 | Bundle the extension into `apps/extension/dist`               |
| `pnpm --filter @teardown/extension dev`                   | Same, rebuilding on save                                      |
| `pnpm --filter @teardown/api fake-session`                | A synthetic session through the real API (see below)          |
| `pnpm --filter @teardown/api generate-latest`             | Generate your latest stopped session and check it (see below) |
| `pnpm --filter @teardown/api grant-credits --email <you>` | Add promo credits to an account (default 5)                   |
| `pnpm --filter @teardown/api recent-sessions`             | The last five sessions: captures, chunks, words, audio        |
| `pnpm --filter @teardown/api usage-events`                | The latest `usage_events` rows (what did this cost)           |

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
| `@supabase/supabase-js`        | api       | Storage (signed upload/download URLs, listing, delete) and deleting auth users   |
| `pg-boss`                      | api       | Postgres-backed job queue for the worker process                                 |
| `openai`                       | api       | Whisper transcription, the vision model, and web search for approved refines     |
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

Automated tests cover `packages/core` (and, from Phase 6, the credit ledger and the Stripe
webhook). Everything else is checked by hand with these lists, run with the API, worker and web
app going.

**API basics**

- [ ] `pnpm test` passes on a fresh clone.
- [ ] `GET /health` returns 200 with no token.
- [ ] `GET /v1/me` returns 401 with no token, a malformed header, or a garbage token.
- [ ] `GET /v1/me` with a real token returns the user; after `grant-credits`, `creditBalance`
      goes up by 5.
- [ ] `GET /v1/sessions/<someone else's id>` returns 404, not 403.

**Backend without the extension**

```bash
pnpm --filter @teardown/api fake-session --email you@gmail.com --delete
```

The script creates a session, uploads a spoken WAV (generated with macOS `say`) as one audio
chunk and three PNGs as captures through the real presign → PUT → register routes, stops the
session, waits for the worker, and prints the transcript with `[CAPTURE n]` markers. (For an
email/password user: `FAKE_EMAIL=… FAKE_PASSWORD=… pnpm --filter @teardown/api fake-session`.)

- [ ] It ends with `captureCount = 3 ✓; wordCount = N ✓`, and the transcript reads like the
      narration, with `[CAPTURE 1]` near "capture this", `[CAPTURE 2]` near "capturing that
      too" and `[CAPTURE 3]` near "one more capture".
- [ ] With `--delete`, the last line reports `GET → 404; objects left in storage: 0; rows left: 0`.
- [ ] `usage-events` shows one `transcribe` row with `audio_seconds` ≈ 33 and about $0.003 (its
      `session_id` is null after `--delete`: usage rows outlive their session on purpose).

**Extension**

- [ ] Sign in with Google from the panel (a Google popup; it closes itself).
- [ ] First use: "Allow microphone" opens a tab; after allowing, the panel enables Start.
- [ ] The idle panel shows the "Stuck for a word? Just ask." tip.
- [ ] Start on a competitor's site. The level meter moves when you talk; a small dark toolbar
      with a red dot appears bottom-centre of the page.
- [ ] Capture with the page button, the panel button, and ⌘⇧S. Each adds a thumbnail to the
      filmstrip within a second; the toolbar is never in the shot.
- [ ] Region: drag a box, capture — the thumbnail shows only the box. Scroll: the box stays.
      Drag a corner or edge to resize it, the green "Move" grip to move it. The × on its
      corner removes it (as does Clear). Esc cancels a region while you are drawing it. The
      page under the box stays clickable.
- [ ] Switch tabs and navigate; the toolbar follows you. On `chrome://` pages ⌘⇧S still
      captures (a plain viewport shot).
- [ ] Close the side panel mid-session, wait 30 s, reopen: the meter is still moving, the
      filmstrip is intact, and `usage-events` keeps growing.
- [ ] Mute the mic for 10 s: the red "No sound" alarm appears; unmute: it goes.
- [ ] Stop. The Stop screen counts captures and words and gives the quality read; the word
      count settles within ~30 s. Delete a capture from the filmstrip (× on hover).
- [ ] Keep going → the meter returns; Stop again; the summary includes both stretches.
- [ ] Generate: the panel clears and a tab opens at `localhost:5173/sessions/<id>`. With 0
      credits it says "Out of credits" instead.
- [ ] A 5-minute session on a real site: `GET /v1/sessions/:id/summary` matches what the panel
      showed.

**Generation from a script**

After recording and stopping a session:

```bash
pnpm --filter @teardown/api generate-latest
```

- [ ] Status goes `syncing → processing → ready`; the document prints and is saved to
      `apps/api/scripts/output/<session>-v1.md`.
- [ ] The image check line ends in ✓ (every `[IMAGE_n]` has an image; none repeated).
- [ ] The usage line shows the model, tokens, one `w×h` per image (none wider than ~2,000 px),
      and a cost of fractions of a cent.
- [ ] "contract-breaking refine → 422 … versions now 1 ✓" and "ordinary refine → 201 (version 2) ✓".
- [ ] Your balance went down by exactly one (`GET /v1/me`); the rejected refine and the kept one
      cost nothing.

**Web app and the full loop**

- [ ] `http://localhost:5173` sends you to Sign in; Google sign-in lands on Sessions.
- [ ] Record a session in the extension, Stop, Generate: the tab that opens shows "Finishing
      the transcript…" / "Writing your document…", then the document, without a reload.
- [ ] Signed out when the extension opens that tab? Signing in lands on that session, not the list.
- [ ] Every screenshot shows in the document. Clicking one opens it large over the page; ← →
      step through captures; Esc or a click on the dark area closes it; "Open original" works.
- [ ] The Revisions panel sits beside the document (a bottom drawer on narrow windows): v1
      "Generated from your walkthrough", then each refine as your request with the model's
      note underneath. The request box is always visible.
- [ ] Refine ("shorten the summary") → a new version appears, is highlighted as Viewing, and
      the document shows it.
- [ ] Click an older version: the document switches, the box says "Editing v2 · your change
      becomes a new version from v2". Refine from there → the new version is labelled
      "from v2". Reload the page: it opens on the version you last viewed.
- [ ] "Remove all the images" → the model's reason appears as a reply; no new version.
- [ ] "Add a comparison with <another product>'s docs" → the model says what it would look up,
      with **Search and apply** / **Not now**. Search and apply → a new version whose added
      text links its sources. `usage-events` shows the refine with its cost (about 1¢ with a
      search).
- [ ] Sessions list: title, date, capture count, status; Delete asks first, then the row goes.
- [ ] Discard in the extension (Stop screen → Discard → Discard) deletes the session: it is
      gone from the web app's library. A stopped session you did _not_ discard shows "Ready to
      generate" with a Generate button.
- [ ] Sign out in the web app does **not** sign the extension out (and vice versa).
- [ ] Account → Delete my account → type the phrase → you land on Sign in with "Your account
      and everything in it has been deleted." `recent-sessions` shows none of your sessions,
      the extension asks you to sign in again, and the storage buckets have no folder for your
      old user id.
