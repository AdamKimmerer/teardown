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
16. **Element pick is out of v1** (deviation from spine §8.2, which had three modes). Trying it
    in spike C showed it is not useful without the ancestor/semantic work the spine itself defers,
    so v1 ships viewport and freehand only. The `element` enum value and the `selectors` /
    `primary_element` columns stay in the schema so the mode has a home when diffing (§15) wants
    it; nothing in v1 writes them.
17. **The filmstrip shows the crop, the server keeps the original.** A capture is always the full
    viewport (spine §10.1); when a freehand region is set, the extension crops a _copy_ for the
    thumbnail so the user sees what they chose, and uploads the untouched original plus the rect.
18. **Hide-before-capture uses `display: none`** on the overlay host, two animation frames, and
    a short extra delay measured by spike C (`visibility: hidden` plus two frames was not enough
    on a real machine). There is no API to exclude an element from `captureVisibleTab`.

## Phase 2 (2026-09-19)

19. **`TRANSCRIBE_MODEL = "whisper-1"`** (§17 E resolved). It is the only OpenAI transcription
    model that returns word-level timestamps ("Use whisper-1 when you need word or segment
    timestamps", speech-to-text guide, 2026-09-19); the `gpt-*-transcribe` family does not.
    $0.006/min. 25 MB per request, which a 30 s chunk is nowhere near.
20. **Chunk overlap: the earlier chunk owns it.** Words from chunk N whose rebased start is before
    the end of the audio that came before it are dropped. The worker logs how many, so §17 N
    (boundary word-split rate) can be measured before deciding on a consolidating pass.
21. **Node 22 is required to run the API and worker**, not just to deploy them: `pg-boss` 12 and
    `supabase-js` 2.116 both refuse Node 20. `.nvmrc` already said 22.
22. **Presigned paths are enforced.** `POST .../captures` and `POST .../chunks` reject a record
    whose path is not exactly the key this API would have presigned for that id/offset, so a
    record can never point at another user's object.
23. _(Words part superseded by #53.)_ **Worker retries are idempotent.** A re-run of `transcribe-chunk` deletes the chunk's words
    before inserting; `singletonKey` keeps a re-registered chunk from queuing twice; 3 retries
    with backoff for transient OpenAI errors.
24. **Ownership is a 404.** Every `/sessions/:id` route loads the session by id and user; an id
    that is not yours is indistinguishable from one that does not exist.

## Phase 3 (2026-09-21)

25. **`POST /sessions/:id/resume`** was added to the API contract for the Stop screen's "keep
    going" (spine §7, §11 step 4); the build plan's endpoint list did not have one. `review` →
    `recording`, with the stopped stretch folded into `paused_ms`.
26. **The panel is plain TypeScript + DOM, no React.** Five small views; React would be the
    extension's largest dependency and the extension goes through Web Store review. React stays
    in the web app.
27. **Audio chunks are separate `MediaRecorder` runs, alternating with a 1 s overlap** (20 s
    each). A single recorder with a timeslice produces header-less fragments Whisper cannot
    read; each chunk here is a complete `.webm`.
28. **The content script does not parse messages with Zod** (exception to convention 9). Zod 4
    is 450 KB minified and the content script is injected into recorded pages; it receives two
    trivial message shapes, checked by hand, and everything it sends is Zod-parsed by the
    worker. Every other runtime uses the Zod union.
29. **Auth lives in the service worker only.** One Supabase client, in one runtime; the panel
    asks the worker to sign in, sign out, and for state. Two clients refreshing the same token
    would race.
30. **`alarms` permission** joined the manifest for the forgot-to-stop nudge; a service worker
    cannot hold a 25-minute timer.
31. **Recovery rules** (service worker start): a `recording` session with no clock in
    `chrome.storage.session` means the browser restarted, so it becomes `review` locally and on
    the server; a `recording` session with no offscreen document gets its recorder restarted;
    anything in IndexedDB not marked uploaded is re-queued.

## Phase 4 (2026-09-24)

32. **`VISION_MODEL = "gpt-6-luna"`**, the cheapest OpenAI model with image input (models page,
    2026-09-24; $0.10 / $0.50 per million tokens), via the Responses API. `gpt-6-sol` is the
    next tier at ~20×. One constant in `ai/models.ts`.
33. **Images go to the model at `detail: "high"`, pre-shrunk by us** to the 2,500-patch budget
    (32-px patches; never enlarged). The first real generation: 4 images = 6,744 patches, 9,061
    input tokens in total, consistent with the documented ~1.2× patch multiplier plus ~1,000
    tokens of text (§17 L, first measurement). ≈ $0.0014 for the whole generation.
34. **Crops exist only for region captures.** A viewport capture's image is its original;
    `crop_path` stays null for it. `images/imageSource.ts` is the one place that decides.
35. **Generation normalises image placeholders instead of failing.** Invalid or repeated
    `[IMAGE_n]` are removed; captures the model left out are appended under "Other captures".
    A paid generation never fails over formatting and never loses a capture.
36. **The credit is spent in the save transaction, after a row lock on the user.** The plan's
    one-statement conditional insert is kept, but on its own two concurrent transactions can
    both read a balance of 1; `select … from users … for update` first serialises spends per
    user. 402 is checked before queuing; a failed generation costs nothing.
37. **No automatic retry of a failed generation.** `sessions.failed_step` records `transcribe`,
    `crop`, `analyze`, `save` or `credits`; POST `/generate` on a failed session re-runs the job,
    and the steps already done (transcripts, cached crops) pass straight through.
38. **Refine is text-only in v1**: the current Markdown plus the marked transcript, no images.
39. **The output contract lives in `packages/core/src/outputContract.ts`** (the plan named
    `apps/api/src/ai/outputContract.ts` but listed its tests under core; pure functions belong
    in core). Thresholds: 0.5–2× length, ≥ 40% of distinct words kept.
40. _(Superseded by #53.)_ **A chunk's words are replaced in one transaction with a row lock**, so the generate job's
    transcription catch-up and a still-queued transcribe job cannot double a chunk's words.
41. **`scripts/devAccessToken.ts` (local only)** mints a real access token for an existing user
    with the service-role key (admin magic link, no email sent) and revokes it afterwards, so
    dev scripts can call the API as a Google-account user. Nothing under `src/` may import it.

## Phase 5 (2026-09-24)

42. **React 19**, not the plan's 18: it is current and nothing in the plan depends on 18.
    React Router 8 (everything imports from `react-router`), TanStack Query 5, Vite 8.
43. **Web sign-in is Supabase's PKCE flow with an explicit exchange** on `/auth/callback`
    (`detectSessionInUrl` off, one shared exchange per code because React runs effects twice in
    development). Where the user was going survives the Google round trip in sessionStorage,
    so a tab the extension opens lands on its session after sign-in.
44. **Sign-out is per surface.** Supabase's `signOut()` defaults to every session of the user;
    the web app, the extension and the web app's 401 handler all pass `scope: "local"`. Signing
    out everywhere is what Delete account does.
45. **CORS allows `WEB_APP_URL` only.** The extension's requests come from its service worker with
    host permissions and are not subject to CORS.
46. **Delete account** marks `users.deleted_at`, deletes the `<user_id>` prefix in every bucket,
    then `auth.admin.deleteUser`, which cascades to every row and revokes every refresh token.
47. _(Reason superseded by #62; the behaviour stays.)_ **The web app can Generate a stopped session (and retry a failed one)**, not only the
    extension: the extension's Discard promises the session stays in the library, so the
    library must be able to finish it.
48. **Documents render `[IMAGE_n]` as Markdown images before rendering**; raw HTML in model output
    is never rendered; images display at their own size up to the column width and open full
    size on click (spine §13). Earlier versions are read-only; refine always edits the current.
49. **No native dialogs in the extension.** Chrome does not show `confirm()` / `alert()` in a side
    panel and returns false, which made Discard silently do nothing. Confirmations in the panel
    are inline rows.
50. **Nothing in the extension waits on a tab.** Chrome freezes background tabs, and a message to
    a frozen tab can hang forever (Chromium issue 40901394); that is what made Stop slow and
    Discard hang. The page controls now show and hide themselves by watching the session in
    `chrome.storage.local`; the worker only pings and injects into the _active_ tab, every tab
    message times out after 1 s, and session transitions never await tab work.
51. _(Response codes superseded by #56.)_ **Refine prompt v2 answers in a fixed JSON shape** (`outcome` edited | declined, `note`,
    `markdown`; Responses API structured output). A declined request returns 422 with the
    model's own explanation and writes nothing into the document; an edit identical to the
    current version is 422 `refine_no_change`; the contract also rejects raw HTML. A saved
    refine returns the model's one-line note on what changed.
52. **Stopping mid-rotation waits for the rotation**, so the two overlapping audio chunks are each
    finished exactly once (previously a Stop in that one-second window could drop the newest
    chunk's last second).

## Interstitial: chunk words (2026-09-26)

53. **Words live on their chunk, not in a table of their own** (deviation from the spine's §4
    table list and the build plan's data model; migration `0002_chunk_words.sql`).
    `audio_chunks.words` is a jsonb array of `{ word, startMs, endMs }` in spoken order, with a
    check that it is an array, and `word_count` is a stored generated column. Words are written
    one chunk at a time and read one session at a time; nothing queried a single word. Saving a
    chunk's transcript is one single-row update (no transaction, no lock; the last complete
    array wins); reading flattens the session's chunks by `offset_ms` and parses them with Zod;
    the word count is `sum(word_count)`. This removed `transcript_words`, its `ordinal` column,
    its unindexed `chunk_id` foreign key, and the locked replace from #40. Backfilled from the
    old table; every dev session's word count matched before and after.
54. **Migrations go through the Supabase CLI via `npx … db push --db-url`.** `0001` had been run
    in the SQL editor, so it was marked applied with `migration repair 0001 --status applied`
    first; the history now matches the files.

## Phase 5 UX batch (2026-09-26)

55. **Versions form a tree; the version you view is current** (migration
    `0003_version_tree.sql`). `document_versions.parent_version_id` records the version a refine
    started from (backfilled as the previous version for the linear history before this) and
    `note` keeps the model's one-line summary of the change. Refine edits the version being
    viewed (`fromVersionId`), so refining an older one branches. Viewing a version calls
    `POST /documents/:id/current`, so it opens there next time and exports will use it.
56. **Refine answers are outcomes, not errors.** `201 edited` saves a version; `200 declined`,
    `200 no_change` and `200 needs_web_search` save nothing and carry the model's note (and the
    search it would run); only an output-contract failure stays `422`, as the build plan says.
    Declined and search-request replies live in the panel for the visit only; they are not
    stored.
57. **Knowledge policy.** Generation (analyze v2) and refine (v3) may use general knowledge to
    name, explain and give context, worded so a reader can tell it from what the analyst
    observed; facts about the walkthrough's product still come from the narration and
    screenshots. Requests the analyst makes out loud during recording ("say where this sits on
    the page") are instructions to carry out. Refine may ask for a web search when it needs
    specific or current facts; only after the user approves does the same request run with the
    `web_search` tool (verified with gpt-6-luna alongside structured output, 2026-09-26). In
    JSON mode OpenAI returns no citation annotations, so the model links its sources in the
    Markdown itself. $10 per 1,000 searches plus tokens: about 1¢ per searched refine, recorded
    in `usage_events.web_searches`. Generation never searches.
58. **Revisions panel** replaces the version dropdown and the refine box: the history as a
    conversation (request, then the model's note on the version it made), the request box
    always visible, docked beside the document and a bottom drawer below 1000px. Refine notes
    say "screenshots", never `[IMAGE_n]`.
59. **Lightbox** instead of opening images in a new tab: ← → between captures, Esc or backdrop
    click closes, "Open original" kept.
60. **Region editing**: resize from any edge or corner, move with a grip above the box, remove
    with a × on its corner (Clear stays in the toolbar). The box's inside stays click-through,
    so moving uses the grip rather than dragging the middle. Starting a move or resize counts as
    picking: `t_pick_start_ms` becomes when the adjustment began. The content script is split
    into `markup.ts`, `regionEditor.ts` and `content.ts`.
61. **"Just ask" tips** in the extension (idle and recording) and in the request box.
62. **Discard deletes the session** (server rows and storage objects, then the local copy). A
    discarded recording has no use in the web app and only cluttered the library. If the delete
    fails the session stays in the extension and the user can try again; a 404 counts as done.
    Stopped sessions that were never discarded still appear in the library with Generate.
63. **Esc cancels only the drawing of a region**, not a move or resize (removed as unneeded).
64. **Refine notes use the user's words.** The model echoed its own rule text ("every image
    placeholder must remain"), so the rules now say "screenshots" throughout and mention the
    `[IMAGE_n]` marker once as a storage detail. Three live declines checked: all plain.
