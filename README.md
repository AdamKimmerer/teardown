# Teardown

Narrate a competitor walkthrough, capture screenshots on demand, and get a structured document
that lands where your team works (HTML, Obsidian, Notion).

One repo, four deployables, one shared package:

```
packages/core/        shared Zod schemas, session clock, marker insertion, crop math, API contract
apps/api/             Hono HTTP API + pg-boss worker (Node)
apps/extension/       Chrome MV3 extension: side panel, content script, offscreen recorder   (Phase 3)
apps/web/             Vite + React web app                                                 (Phase 5)
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

## Everyday commands

| Command                                    | What it does                                                   |
| ------------------------------------------ | -------------------------------------------------------------- |
| `pnpm build`                               | Build every package (core first; the apps depend on it)        |
| `pnpm test`                                | Run every package's Vitest suite                               |
| `pnpm typecheck`                           | `tsc --noEmit` in every package                                |
| `pnpm lint` / `pnpm format`                | typescript-eslint recommended / Prettier defaults              |
| `pnpm --filter @teardown/api dev`          | API with reload on save, reading `apps/api/.env`               |
| `pnpm --filter @teardown/api dev:worker`   | The queue worker (transcription; later generation and exports) |
| `pnpm --filter @teardown/api fake-session` | Phase 2 end-to-end check (see Manual test scripts)             |

After changing anything in `packages/core`, run `pnpm --filter @teardown/core build` so the apps
see it (or leave `pnpm --filter @teardown/core build --watch` running).

## Dependencies

Each runtime dependency, and what it is for. Add one only when it replaces more than ~100 lines.

| Package                 | Used by | Why                                                                    |
| ----------------------- | ------- | ---------------------------------------------------------------------- |
| `zod`                   | all     | Schemas that are also the only source of TypeScript types              |
| `hono`                  | api     | The HTTP router: routes, middleware, typed context                     |
| `@hono/node-server`     | api     | Runs a Hono app on Node's `http` server                                |
| `jose`                  | api     | Verifies Supabase JWTs against the project's JWKS                      |
| `postgres`              | api     | Postgres client (`postgres.js`); queries are hand-written SQL          |
| `@supabase/supabase-js` | api     | Storage client: signed upload/download URLs, object listing and delete |
| `pg-boss`               | api     | Postgres-backed job queue for the worker process                       |
| `openai`                | api     | OpenAI SDK: Whisper transcription now, vision models in Phase 4        |

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
- [ ] `select * from usage_events` shows one `transcribe` row with `audio_seconds` ≈ 30 and a
      cost estimate of about $0.003.
- [ ] Run it again without `--delete`, then delete the session's row from `sessions` in the
      dashboard: its captures, audio_chunks and transcript_words rows disappear (the cascade),
      but its storage objects remain — only the API's DELETE cleans those.
- [ ] `GET /v1/sessions/<someone else's id>` returns 404, not 403.
