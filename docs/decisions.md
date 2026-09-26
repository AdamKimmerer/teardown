# Decisions

Every deliberate decision about the product, architecture, stack or schema, newest at the
bottom, one entry each so any of them is one line to revisit.

Each entry says what was decided, why, and what it changed: the spine or build-plan section it
updates, and the migration or files involved. The spine and build plan are updated in the same
change, so they always describe Teardown as it is; this log keeps the reasons.

## Entries

1. **Promo codes are entered on the payment page** (spine §6.2). Resolves the open question of
   where redemption happens.
2. **The credit balance is always visible**: in the web app's top bar on every page, and in the
   extension panel next to Generate (build plan, Phase 6). It was only on the Account page, and
   nowhere in the extension.
3. **No "being deleted" check on every request.** Until an account is actually deleted, nothing
   assumes it is going away (spine §5). The deletion itself takes seconds.
4. **Web searches are not rate-limited separately** (spine §6.4). They are rare, need the user's
   approval, and cost about 1¢ each.
5. **Transcription gets a head-to-head test before Phase 9 closes**: the current chunk stitching
   against a whole-recording pass at Stop, on real sessions; the better one stays (spine §9.1).
6. **Two questions added for later phases**: export controls and formats, including whether a
   common help-center/docs/CMS import format is worth offering (spine §17.4, Phase 7); and the
   product name and domain, which may change with domain availability (spine §17.5, Phase 8).
