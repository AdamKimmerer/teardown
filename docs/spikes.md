# Phase 1 spike results

One paragraph per spike (build plan §Phases, row 1). Spikes (a) and (d) failing would change
§Architecture; the others inform Phase 2–3 details. Folders live in `spikes/` until Phase 3
replaces them.

## (a) Offscreen-document microphone — PASS (2026-09-19)

Findings so far on a real Chrome profile: the side panel cannot show the microphone prompt
(a Chrome limitation for panels, popups and offscreen documents, not something to fix); a
full-tab extension page can, and the grant applies to the extension origin. Decision: the real
extension opens that page as an onboarding step (decisions.md #12). The device list in the panel
only gains labels after the grant and must be re-listed on `devicechange` / visibility.

Also found: the offscreen document has no `chrome.storage` (only `chrome.runtime` messaging);
the first spike version died on that before reaching the mic (decisions.md #13).

Result: after the tab grant, `getUserMedia` succeeds inside the offscreen document, the
AudioContext runs once resumed explicitly (no user gesture exists there), the level meter moves,
and a 10 s MediaRecorder run completes with audio/webm;codecs=opus chunks. The recording engine
can live in the offscreen document as spine §8.4 assumes; §17 M is resolved.

## (b) captureVisibleTab → PNG → IndexedDB → Supabase signed upload — PASS (2026-09-19)

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

Extension side, on a real Chrome profile (Retina display, dpr 2):

- `captureVisibleTab({ format: "png" })` returned a **4064×2748** PNG for a 2032×1374 CSS
  viewport — physical pixels, exactly CSS × dpr, as spine §8.4 assumes. 0.76 MB for a text-heavy
  page, **192 ms** per call. Blob → IndexedDB → filmstrip thumbnail via `URL.createObjectURL`
  works with no base64 anywhere.
- Five captures fired at once: **2 of 5 succeeded** in 266 ms; the other three failed with
  `This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.` That is the ~2/s
  limit the plan's queue paces around; the service worker's queue must recognise that message
  and retry rather than drop.
- Upload of a real capture to a signed URL: PASS, size verified on the server.
- (The 6 MB check from the extension first failed on the spike's own test code —
  `crypto.getRandomValues` caps at 64 KB — fixed; the 6 MB result above stands from Node.)

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

## (d) launchWebAuthFlow → signInWithIdToken — PASS (2026-09-19)

Works on a real Chrome profile: `launchWebAuthFlow` (`response_type=id_token`, hashed nonce)
returns a Google ID token, `supabase.auth.signInWithIdToken({ provider: "google", token,
nonce })` accepts it, and the session persists through the `chrome.storage.local` adapter.
§17 F is resolved in favour of `launchWebAuthFlow`.

Two things the docs got wrong, both now in decisions.md: the Google OAuth client must be of
type **Web application** with `https://<extension-id>.chromiumapp.org/` as an authorized
redirect URI (a "Chrome Extension" client, which Supabase's guide suggests, only permits
`getAuthToken` and fails with `redirect_uri_mismatch`); and Google takes a few minutes to
propagate redirect-URI changes, which looks like the same error. UX note: `launchWebAuthFlow`
always opens Google in a small popup window; that is the API, not a choice. Signing in through
the web app in a tab and handing the session to the extension is the alternative if the popup
proves unpopular — a post-v1 item.
