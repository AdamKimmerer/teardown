# Phase 1 spikes

Four throwaway extensions, one per risk the build plan wants retired before Phase 2. Each is a
folder you load unpacked; each has on-screen PASS/FAIL. Results go in `docs/spikes.md`.
Delete this folder once Phase 3 has replaced them.

## Loading an unpacked extension

1. Chrome → `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → pick the spike's folder (for example `spikes/a-offscreen-mic`).
3. Pin it from the puzzle-piece menu so its icon is visible. Clicking the icon opens its side panel
   (spikes A, B, D) or injects the overlay into the current tab (spike C).
4. After editing files, click the ↻ on the extension's card, then reopen the panel.

All four share the same `key`, so their extension id is always `knphccpkdmgbckallojfoedobifonjop`.
Load one at a time or Chrome will complain about the duplicate id.

## A — offscreen microphone

1. Open the panel. Click **1. Request mic from this panel** and allow. If Chrome shows no prompt or
   refuses, click **1b** to open a full-tab page, allow there, close it, and come back.
2. Click **2. Record 10 s in the offscreen document** and talk. The meter should move.
3. While it records, close the side panel and reopen it. The result should still appear.
4. PASS = green verdict with chunk count, bytes and a non-zero peak RMS. Note which grant path
   worked (panel or full tab).

## B — capture → IndexedDB → signed upload

Needs `apps/api/.env` filled in. In one terminal, from the repo root:

```bash
node --env-file=apps/api/.env spikes/b-capture-upload/presign-server.mjs
```

1. Open any normal web page, then open the panel. It should say the server is up with four buckets.
2. **1. Capture** — a thumbnail appears; the log shows PNG size and pixel dimensions (should be the
   tab's CSS size × its devicePixelRatio).
3. **2. Burst** — five captures at once; expect some to fail with a rate-limit error. That is the
   number the real queue paces around.
4. **3. Upload** — PUTs the PNG to a signed URL and checks the size on the server.
5. **4. Upload 6 MB** — the plan's "over 5 MB" question.

## C — closed-shadow-root overlay

No setup. Open a page, click the icon; a dark toolbar appears bottom-centre. Click again to remove.

Try it on three pages: `docs.stripe.com`, `linear.app` (signed in), and a public Notion page.

- **Freehand**: drag a box. Scroll — it must stay where it was on screen. Esc cancels a drag.
- **Capture**: the toolbar hides, a shot is taken, and a thumbnail appears in the toolbar. With a
  freehand box set, the thumbnail is the crop (rect × dpr from the full shot); without one it is
  the full viewport. Look closely at the thumbnail: the toolbar and the dashed box must not be in
  it. The **+ms** picker adds a wait between hiding and shooting — start at +0 and find the
  smallest value at which the toolbar never appears; that number goes in the results.
- Navigate within the app (Linear views, Notion pages). Does the toolbar survive? It should on
  same-document SPA navigation and vanish on a full page load (expected: the real extension
  re-injects on navigation).

## D — Google sign-in from the extension

Setup, once:

1. `apps/api/.env` needs `SUPABASE_ANON_KEY=` (Supabase → Project Settings → API → anon public).
2. Google Cloud: an OAuth client of type **Chrome Extension** with item id
   `knphccpkdmgbckallojfoedobifonjop`; its client id is already in `d-auth/manifest.json`.
3. Supabase → Authentication → Providers → Google: that client id is listed under
   **Authorized Client IDs**.
4. Build the panel bundle (repeat after any edit to `panel.src.js`):

```bash
pnpm --filter @teardown/spikes build:d
```

5. Start the API in another terminal: `pnpm --filter @teardown/api dev`.

Then: load `spikes/d-auth`, open the panel, **1. Sign in** (a Google window opens; pick your
account), **2. GET /v1/me** (the real API must accept the token and return your user),
**3. Refresh** (proves the chrome.storage.local adapter round-trips), close and reopen the panel
(the session should be restored).
