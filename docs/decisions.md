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
7. **Phase 7 includes an FAQ experiment**: try generating an FAQ from a session with a second
   prompt, to see whether help-center and docs writing is a use worth offering (build plan,
   Phase 7). It is an experiment, not a commitment to a second document type.
8. **Every generation is a locked preview first; the credit is spent on Unlock** (spine §6.1,
   §6.5 flow; build plan, Phase 6 and API). Generate never spends and never returns 402; the
   document is saved locked, the API sends only the preview part, and `POST
   /documents/:id/unlock` spends one credit on the same document. Applies to users with credits
   too, so no one pays for a thin session. Chosen over free sign-up credits (blurs the
   willingness-to-pay signal) and a canned demo teardown (not the user's own work).
9. **No limit on waiting previews** (spine §6.1). A limit would only make users choose which
   session gets a preview, which helps nobody; runaway use is bounded by the invisible ceilings
   (§6.4). A one-preview and a three-preview limit were both considered and dropped.
10. **The locked page shows the Revisions panel, locked, with "Unlimited revisions after
    unlocking"** (spine §6.1; build plan, web app spec), so users judge a preview knowing it can
    be reshaped, rather than re-recording over something refine would fix.
11. **At zero credits the extension's idle panel says a preview is coming and offers Buy
    credits; it never blocks Start** (spine §6.1). Nobody records thirty minutes without knowing
    unlocking costs a credit.
12. **Reminder emails for waiting work go to the backlog** (backlog, Accounts). They need an email
    provider, unsubscribe and a privacy-policy line.
13. **Recording without the extension is an open question, owner leaning no** (spine §17.7).
