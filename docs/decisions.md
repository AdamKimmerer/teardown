# Decisions

Decisions made after the baseline (2026-09-26), newest at the bottom, one entry each so any of
them is one line to revisit. Each says what was decided, why, and what it changed (spine or
build-plan section, migration, file).

Everything decided before the baseline is stated as current fact in `spine.md` and
`build-plan.md`. The log that led there (entries 1–64, still cited by migrations `0002` and
`0003`) is at the git tag `pre-baseline`, in `docs/decisions.md`. Numbering continues from 65 so
those references stay unambiguous.

## Baseline (2026-09-26)

65. **The docs were rebaselined on the working prototype.** `spine.md` (v6), `build-plan.md` and
    `backlog.md` were written from the code as built through Phase 5. They replace the earlier
    spines and build plan, which were written before any code existed. The pre-baseline decision
    log and spike notes were folded in: their still-true content is now in the spine, the build
    plan ("Platform facts") and the backlog. The originals are at the tag `pre-baseline`. Why: a
    developer joining now should need nothing older than the prototype to understand it or build
    on it.
