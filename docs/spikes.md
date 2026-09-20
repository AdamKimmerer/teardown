# Phase 1 spike results

One paragraph per spike (build plan §Phases, row 1). Spikes (a) and (d) failing would change
§Architecture; the others inform Phase 2–3 details. Folders live in `spikes/` until Phase 3
replaces them.

## (a) Offscreen-document microphone — pending

_To be filled in from a real Chrome profile: which grant path worked (side panel or full-tab page),
whether the recording survived closing the panel, chunk count / bytes / peak RMS._

## (b) captureVisibleTab → PNG → IndexedDB → Supabase signed upload — server side verified 2026-09-19

Verified from Node against the real project, before the extension part was run:

- Buckets `originals`, `crops`, `audio`, `exports` exist (created by `0001_init.sql`).
- Presign is `POST /storage/v1/object/upload/sign/<bucket>/<path>` with a JSON body (`{}` is
  required when the content-type is JSON) and returns a relative `url` with `?token=`. A raw
  `PUT` of the bytes to `<SUPABASE_URL>/storage/v1<url>` with a `content-type` header succeeds
  with 200 and `{"Key": "<bucket>/<path>"}`.
- **A 6 MB upload succeeds** (1.1 s from this connection), so the plan's ">5 MB on your plan"
  question is answered: fine on the free tier (limit is 50 MB).
- **Retries need upsert in the token.** A second `PUT` to an existing path returns 409
  `KeyAlreadyExists`; sending `x-upsert: true` on the PUT alone does not help, and presigning an
  existing path without upsert also fails with 409. Presigning with `x-upsert: true` (what
  supabase-js does for `createSignedUploadUrl(path, { upsert: true })`) makes both the same
  URL and a fresh presign replace the object. **Phase 2 rule: every presign is upsert.**

_Extension side (captureVisibleTab timing, PNG dimensions vs dpr, burst rate limit) pending._

## (c) Closed-shadow-root overlay on hostile pages — Stripe docs verified 2026-09-19; Linear and Notion pending

Driven from a headless browser pane on `docs.stripe.com/payments`:

- The host renders at max z-index above Stripe's cookie banner; `shadowRoot` reads `null` from
  the page (closed); page CSS does not reach the toolbar and `all: initial` on the host keeps
  ours from leaking.
- Freehand drag records a CSS-px rect that matches the screen (1024×768 viewport, dpr 2) and
  stays put while the page scrolls.
- Element pick: rAF-throttled hover highlight with selector and ancestor-dedupe count; clicking a
  link in pick mode records the region and **does not navigate**.
- Capture: hide → two rAF → shoot → restore took 28 ms.
- The overlay survived Stripe's SPA route change (same document).

Two bugs found and fixed by this run, both of which would have hit every page: `composedPath()`
is empty once dispatch ends, so the target must be read synchronously and only the layout work
deferred to rAF; and picking on `mousedown` then removing the `click` listener let the link's
default action through — presses are now swallowed and the pick happens on `click`.

## (d) launchWebAuthFlow → signInWithIdToken — pending

Built to Supabase's documented Chrome-extension flow (`response_type=id_token`, Chrome
Extension–type OAuth client, client id in Authorized Client IDs) plus a hashed nonce. _To be
filled in: whether Supabase accepted the token, whether `GET /v1/me` on the API accepted the
resulting access token, whether refresh through the `chrome.storage.local` adapter worked._
