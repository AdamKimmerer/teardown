# Where the build is

The one-page state of the Teardown v1 build: what is done, what is next, and how work happens
here. The _why_ of every departure from the build plan or the spine is in
[decisions.md](decisions.md) (numbered, with superseded ones marked); spike and measurement
results are in [spikes.md](spikes.md). Update this file at the end of each phase.

Last updated: 2026-09-26, after commit `813cdcb`.

## Progress against the build plan

| Phase                     | State                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Scaffold                | Done                                                                                                                                                                                                                                                                         |
| 1 Spikes                  | Done — all four passed; findings in spikes.md                                                                                                                                                                                                                                |
| 2 Backend core            | Done                                                                                                                                                                                                                                                                         |
| 3 Extension capture path  | Done                                                                                                                                                                                                                                                                         |
| 4 Generation              | Done                                                                                                                                                                                                                                                                         |
| Interstitial: chunk words | Done — `transcript_words` replaced by `audio_chunks.words` (migration 0002, decision #53)                                                                                                                                                                                    |
| 5 Web app minimum         | Built, including the UX batch (Revisions panel, version tree, web search on approval, lightbox, region move/resize/×, "just ask" tips, Discard deletes). **Waiting on the owner's end-to-end run**, which ends with Delete account (README → Manual test scripts → Phase 5). |
| 6 Billing                 | Next. After the Phase 5 run: re-grant test credits to the new account (`grant-credits`).                                                                                                                                                                                     |
| 7–9                       | Not started                                                                                                                                                                                                                                                                  |

## The product as built differs from the plan in these ways (details: decisions.md)

- **Auth:** Supabase Auth, JWTs verified via JWKS (#1); one Google OAuth client of type _Web
  application_ serves both surfaces (#15); extension signs in with `launchWebAuthFlow` in a
  popup (#15, spikes.md d); sign-out is per surface (#44).
- **Capture:** viewport + freehand only; element pick removed (#16). Regions can be resized,
  moved by a grip, removed with ×; adjusting resets `t_pick_start_ms` (#60, #63). The filmstrip
  shows crops, originals are uploaded untouched (#17). Mic permission is an onboarding tab (#12).
- **Extension robustness:** nothing waits on tabs (Chrome freezes background tabs); page controls
  follow the session in `chrome.storage` (#50). No native `confirm()` in the side panel (#49).
  Discard deletes the session on the server (#62).
- **Schema:** words live on `audio_chunks` as a jsonb array with a generated `word_count` (#53);
  document versions form a tree (`parent_version_id`, `note`) and the viewed version is current
  (#55); `usage_events.web_searches` (#57). Migrations 0001–0003.
- **AI:** `whisper-1` for word timestamps (#19); `gpt-6-luna` for generation and refine (#32),
  images pre-shrunk to the high-detail patch budget (#33). Prompts `analyze.v2`, `refine.v3`.
  General knowledge allowed as clearly worded context; spoken requests are carried out; refine
  may ask to search the web and only searches after approval (#57). Refine answers are outcomes
  (edited 201 / declined, no_change, needs_web_search 200 / contract failure 422) (#56).
- **Web app:** React 19 (#42); Revisions panel beside the document (#58); lightbox (#59); the
  web app can generate stopped sessions (#47).

## Running it locally

From the repo root, Node 22 (`fnm` switches automatically in this folder; the owner's default
Node is 20 for another project):

```bash
pnpm --filter @teardown/api dev          # API on :3000
pnpm --filter @teardown/api dev:worker   # queue worker
pnpm --filter @teardown/web dev          # web app on :5173
pnpm --filter @teardown/extension build  # then load apps/extension/dist unpacked
```

- Extension id `knphccpkdmgbckallojfoedobifonjop` (pinned by the manifest `key`; the private key
  is in `~/.teardown/`, outside the repo).
- Database: Supabase project `otzvfiyxbdjwwzoadxif`. Migrations go through the CLI via `npx`:
  `npx supabase@latest db push --db-url "<DATABASE_URL from apps/api/.env>"` (#54).
- Dev scripts (`pnpm --filter @teardown/api <name>`): `fake-session [--email x] [--delete]`,
  `generate-latest [--session id] [--no-refine]`, `grant-credits --email x`, `recent-sessions`,
  `usage-events`. `scripts/devAccessToken.ts` lets scripts act as a real user (local only, #41).
- `.env` files: `apps/api/.env`, `apps/extension/.env`, `apps/web/.env` (not committed; examples
  alongside).

## How work is run

- Phase by phase. Before each phase: the files to be created or changed and the open decisions,
  then wait for the owner's go-ahead. Each phase ends with what was built, how to run it, what
  needs doing by hand, and what is not done.
- Prefer the best architecture now over less work; flag plan/spine conflicts rather than
  working around them; verify library and API facts against current docs and note them.
- Explanations in plain language; product decisions are the owner's.
- Every deviation gets a numbered entry in decisions.md; commits end with the co-author line.

## Open threads

- Google OAuth consent-screen verification is the longest pole; start it before launch (spine §18).
- Phase 9 measurements are ready to collect: chunk-boundary drops (worker log), pick-start gaps
  (`captures`), per-call cost (`usage_events`).
- Post-v1 ideas raised and parked: sign-in via the web app instead of the extension popup;
  comparing two teardowns (spine §15 direction); storing declined refine requests.
