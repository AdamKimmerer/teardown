# Roadmap

The work ahead for Teardown, in order. Phases 0–5 (scaffold, backend, extension capture,
generation, web app) are built. Each phase below finishes its done-criteria before the next one
starts; the full specs are in [docs/build-plan.md](docs/build-plan.md) → "Remaining work by
phase", and the current state is in [docs/STATUS.md](docs/STATUS.md).

## Now: close out Phase 5

- [ ] Full end-to-end run of the web app: record → Generate → document renders → refine →
      delete account removes every row and storage object.

## Phase 6: Billing

- [ ] Stripe Checkout and webhook; `/billing` screens with success and cancel.
- [ ] Locked preview for every generation: Generate never spends, the API sends only the preview
      part, `POST /documents/:id/unlock` spends the credit.
- [ ] 402 from Unlock leads to checkout and returns to the page it started from.
- [ ] Credit balance visible everywhere: the web app's top bar and the extension panel.
- [ ] Promo code field on the payment page; one grant per user, stops at its limit.
- [ ] Library flags sessions waiting to be generated or unlocked.
- [ ] Copy updates: Revisions panel says revisions are unlimited; the extension's idle panel
      explains the preview at zero credits.
- [ ] Vitest for the credit ledger; webhook integration test from a recorded event (replays
      credit once).
- [ ] Decide: recording from the web app (spine §17.6), after a feasibility test.

## Phase 7: Exports

- [ ] Settle the export menu and formats first, including how images land in the right place on
      CMS import (spine §17.4).
- [ ] `Connector` interface.
- [ ] Web page export (one self-contained HTML file).
- [ ] Markdown ZIP that unzips into an Obsidian vault with working image links.
- [ ] Notion OAuth and push (verify the current file-upload API first).
- [ ] Export menu and job list; exports use the current version.
- [ ] Experiment: a second prompt that turns a session into an FAQ, to see if it's worth offering.

## Phase 8: Landing page and deploy

- [ ] Settle the product name and domain (spine §17.5).
- [ ] Decide on recording without the extension (spine §17.7); it shapes the landing page.
- [ ] Landing page, privacy policy and terms pages (`apps/landing`).
- [ ] Choose the host for the API and worker (Railway or Fly.io), checked against a 40-capture
      generation; deploy both.
- [ ] Static hosting and DNS for the landing page and web app.
- [ ] Production Supabase, Google OAuth and Stripe configuration.
- [ ] Chrome Web Store ZIP build script.
- [ ] Start Google OAuth consent-screen verification (the longest pole before launch).

## Phase 9: Instrumentation and hardening

- [ ] "What did this session cost" report from `usage_events`.
- [ ] Capture timing gap report (`tPickStart` → `tCapture`) and chunk-boundary drop report.
- [ ] Request size limits.
- [ ] Per-generation caps and rate limits, with clear errors.
- [ ] Head-to-head test: chunk stitching vs. a whole-recording transcription pass at Stop, on
      real sessions; keep the winner.

## Launch checklist

- [ ] Privacy policy and terms text; DPA template.
- [ ] Google OAuth verification approved.
- [ ] Stripe live keys, webhook registered and replay-tested, both credit packs, Stripe Tax.
- [ ] Chrome Web Store listing with pricing disclosed (expect extended review for `<all_urls>`).
- [ ] Delete account tested end to end on production, including the storage cascade.
- [ ] Beta invites with promo codes.

## After launch

The work most likely to follow, roughly in priority order. Reasons and details for each are in
[docs/backlog.md](docs/backlog.md).

**Running the beta**

- [ ] Set real cap and rate-limit values from the session distribution (spine §17.2).
- [ ] Watch cost per session and generation quality on real walkthroughs; tune the prompts.
- [ ] Error monitoring and alerting for the API and worker.
- [ ] Fix what beta users hit first; respond to Web Store review feedback.
- [ ] Regenerate from scratch (free; only the first generation spends).
- [ ] Reminder emails for waiting previews and ungenerated sessions (needs an email provider and
      a privacy-policy line).

**Product**

- [ ] Provenance stamping: "as of [date], verified against N screenshots", with per-claim links
      to the source capture.
- [ ] Review tools the data model already supports: re-crop, redaction, transcript snippets
      under thumbnails.
- [ ] Element pick, then element anchoring.
- [ ] Gap detection: flag narrated stretches with no capture and offer to recapture.
- [ ] Inline AI editing tied to the source capture and transcript span.
- [ ] Re-walkthrough diffing: record the same competitor months later and get a diff.
- [ ] Library search and filters; one-tap refine presets.
- [ ] Confluence and other connectors, teams and SSO, prompt types beyond competitive
      analysis: when demand names them.
