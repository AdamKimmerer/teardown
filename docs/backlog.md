# Backlog

Ideas worth keeping that are not in v1. Nothing here gets built until the owner moves it into
scope (build plan, "How work is run"). Each entry says what it is, why it waits, and what already
exists for it. Grouped by area; the rough strategic order is at the end.

---

## Capture

- **Element pick.** Hover to preview, click to capture one element, recording its selectors
  (`data-testid` → `id` → tag + role; never `nth-child` or hashed classes). Tried in a spike: it
  is not useful without semantic-ancestor scoring, because div-heavy sites offer eight identical
  "levels". Its real value is for diffing: a stored selector can be found again months later. The
  schema already has `region_mode = 'element'`, `selectors`, `primary_element` and
  `element_text_hash`. Needs: rect-based ancestor dedupe, semantic scoring, 8–12 px padding (the
  border box guillotines shadows), `preventDefault` on the picking click.
- **Element anchoring.** A pinned element that persists across captures and follows re-layout and
  route changes (live reference with a selector fallback, an off-screen policy, dimming when not
  visible). The "SPA panel that resizes" case. Depends on element pick.
- **Picker extensions:** multi-element union crops; freehand that snaps to an element;
  breadcrumb UI for choosing an ancestor; picking inside iframes. Only if targets turn out to need
  them.
- **Re-crop in review.** Change a capture's region after the session, from the original. The data
  model supports it (original and region are stored separately).
- **Redaction.** Same code path as re-crop, with one hard rule: it must destroy the pixels in the
  original, or it is not redaction.
- **Transcript snippet under each thumbnail** in review (a word-count window around the capture).
- **Mark the span, not the instant.** Give the model `[SELECTING n] … [CAPTURED n]` using
  `tPickStart`. Measure first how much speech falls in that gap (Phase 9).
- **Trigger-word or automatic capture** (on a spoken phrase, on navigation, on scroll). Conflicts
  with "few frames, perfect salience" (spine §15); only if users ask.
- **Mobile or native-app capture.**

## Recording and transcript

- **Consolidating transcription pass.** One pass over the whole recording at Stop, to fix words
  split at chunk boundaries. Not needed on the sessions measured so far (overlap alone reads
  cleanly). Scheduled: a head-to-head test on real sessions before Phase 9 closes.
- **Local or offline transcription.** Out of scope rather than deferred: the cost argument is
  cents and the effort is large.

## Documents and AI

- **Provenance stamping.** "As of [date], verified against N screenshots", and per-claim links to
  the source capture. The structural answer to "can I trust AI-written competitive intel":
  traceability, not generic accuracy.
- **Inline AI editing.** Edit a passage in place, tied to its source capture and transcript span,
  so factual corrections are distinguishable from tone edits.
- **Gap detection with recapture.** After Stop, flag narrated stretches with no capture ("you
  talked about pricing at 3:12 but captured nothing") and offer to recapture. Works from narration
  and capture times, never pixels. (Autonomous crawling with Playwright was considered and
  dropped: auth walls, terms-of-service and bot-detection risk, unclear value.)
- **Regenerate from scratch.** Run generation again on the same transcript and captures, free
  (only the first generation spends a credit).
- **One-tap refine presets** such as Simplify and Expand, alongside the free-text request.
- **Refine sees the screenshots.** Refine is text-only today (the document plus the marked
  transcript). Sending images would help requests about what is on screen; it is a margin
  question, not a product one.
- **Keep declined refine requests.** Declined and search-request replies show for the visit only.
  Storing them would let the owner see what users ask for that the product will not do.
- **Prompt taxonomy.** Different document types (sales-call teardowns, UX audits) and depth
  levels. Ship one excellent competitive-analysis prompt first and let demand name the second.
- **Fixed output schema** (Overview / Key flows / Strengths / Weaknesses / Opportunities) as an
  option. The free-form structure follows the walkthrough, which is usually better.
- **Compare two teardowns** of different products side by side. Related to diffing.
- **Streaming generation progress** instead of a step label.

## Strategy-level

- **Re-walkthrough diffing.** Record the same competitor months later and get a diff against the
  previous teardown. The strategic product (spine §15): it creates a retained asset, answers the
  #1 practitioner pain (staleness), and would justify a subscription. Everything it needs is
  stored today; element pick would make it sharper. Worth nothing until users have recorded the
  same competitor twice.

## Exports and connectors

- **Confluence push**, and further destinations through the same `Connector` interface.
- **A Confluence-style "insert image here" callout variant** of the Markdown export, only if it
  costs nothing.

## Accounts, pricing and platform

- **Sign in through the web app instead of the extension's popup.** The extension's Google
  sign-in always opens a small popup window (a Chrome API constraint). Signing in on a web app
  tab and handing the session to the extension is the alternative if the popup proves unpopular.
- **Teams, shared libraries, SSO, enterprise.**
- **Subscription pricing**, once diffing gives users a history worth paying rent on. Annual
  billing and overage top-ups stay out until then (buying a pack is the top-up).
- **Library filters and search**; account-management polish. Build-order items for when the
  library gets long.

## Privacy features

Built only when testing or a customer names the need (spine §14): ephemeral / don't-retain
sessions, a never-capture domain list, an off-target-domain warning, retention controls, and a
public security page. The security page is the likeliest to come first, as sales enablement when
a prospect's IT asks.

---

## Deliberately not doing

Decided against, not merely deferred. Reopen only with a new argument.

- **A live transcript, clock or word count during recording** (spine §7).
- **Classifying refine requests** as on- or off-topic (spine §12.1).
- **A per-generation refine cap** (spine §12.1).
- **An admin tool for browsing user sessions** (spine §14, item 8).
- **Soft delete or a trash** (spine §14, item 5).
- **Bring-your-own API key.** Managed keys are the product for non-technical buyers.
- **A free tier** (spine §6.1).
- **Electron or a desktop app.** A Chrome extension is where competitive walkthroughs happen.

---

## Rough strategic order

1. Provenance stamping.
2. Review affordances the data model already supports: re-crop, redaction, snippets.
3. Element pick, then anchoring (also sharpens diffing).
4. Gap detection with recapture.
5. Inline AI editing.
6. Re-walkthrough diffing.
7. Picker extensions, privacy features, connectors, teams, prompt taxonomy: when demand names
   them.
