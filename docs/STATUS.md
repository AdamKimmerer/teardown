# Where the build is

The one-page state of Teardown v1. Updated at the end of each phase.

Last updated: 2026-09-26, at the baseline (end of Phase 5).

## Progress

| Phase                                                                  | State                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–4 Scaffold, spikes, backend core, extension capture path, generation | Done                                                                                                                                                                                  |
| 5 Web app minimum                                                      | Built. **Waiting on the owner's end-to-end run** (README → Manual test scripts → "Web app and the full loop"), which ends with Delete account.                                        |
| 6 Billing                                                              | Next. First, re-grant test credits to the new account: `pnpm --filter @teardown/api grant-credits --email <you>`. Then plan the phase (files, open decisions, including spine §17.4). |
| 7 Exports · 8 Landing and deploy · 9 Instrumentation and hardening     | Not started                                                                                                                                                                           |

What each phase builds and its done-criteria: `build-plan.md` → "Remaining work by phase".

## Running it locally

Node 22 is required (`fnm` switches automatically in this folder). From the repo root, in four
terminals:

```bash
pnpm --filter @teardown/api dev          # API on http://localhost:3000
pnpm --filter @teardown/api dev:worker   # queue worker (transcription, generation)
pnpm --filter @teardown/web dev          # web app on http://localhost:5173
pnpm --filter @teardown/extension dev    # rebuilds apps/extension/dist on save
```

Load `apps/extension/dist` unpacked in `chrome://extensions` and click ↻ after rebuilds. Full
setup from a fresh clone: the repo README.

- **Extension id** `knphccpkdmgbckallojfoedobifonjop`, pinned by the manifest `key`. The private
  key is kept outside the repo (`~/.teardown/`).
- **Supabase project** `otzvfiyxbdjwwzoadxif`. New migrations:
  `npx supabase@latest db push --db-url "<DATABASE_URL from apps/api/.env>"` (add `--dry-run`
  first).
- **`.env` files:** `apps/api/.env`, `apps/extension/.env`, `apps/web/.env`. Never committed;
  each has an `.env.example`.

## Dev scripts

Run as `pnpm --filter @teardown/api <name>`, with the API and worker running:

| Script                                         | What it does                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `fake-session [--email you] [--delete]`        | Records a synthetic session through the real API (spoken WAV + three PNGs) and prints the marked transcript; `--delete` checks the cascade |
| `generate-latest [--session id] [--no-refine]` | Generates your latest stopped session and runs two refines (one contract-breaking), printing checks and cost                               |
| `grant-credits --email you [--credits n]`      | Adds promo credits (default 5)                                                                                                             |
| `recent-sessions`                              | The last five sessions: captures, chunks, words, audio                                                                                     |
| `usage-events`                                 | The latest OpenAI calls with tokens, image sizes and cost                                                                                  |

`--email` works for Google-account users through `scripts/devAccessToken.ts`, which mints a real
access token with the service-role key and revokes it afterwards. Local development only;
nothing under `src/` may import it.

## Open threads

- **Known gap: the "being deleted" guard.** Delete account marks `users.deleted_at` first, but
  only `GET /me` checks it. The auth middleware should reject users that are missing or being
  deleted (listed under Phase 9 hardening; small enough to do sooner).
- **Google OAuth consent-screen verification** is the longest pole before launch. It can start as
  soon as the landing page and privacy policy are live (spine §18).
- **Phase 9 measurements are ready to collect:** chunk-boundary drops (worker log), pick-start
  gaps (`captures`), per-call cost (`usage_events`).
