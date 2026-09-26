# Teardown docs

Read in this order when joining the project:

1. **[STATUS.md](STATUS.md)**: where the build is right now, what's next, how to run it.
2. **[spine.md](spine.md)**: the product and its architecture. What Teardown does, the principles
   it follows, and why each part works the way it does.
3. **[build-plan.md](build-plan.md)**: the engineering reference. How work is run, the stack,
   repo layout, conventions, schema, API, the remaining phases, and the platform facts the code
   relies on.
4. **[decisions.md](decisions.md)**: decisions made since the baseline, one entry each with the
   reason.
5. **[backlog.md](backlog.md)**: ideas beyond v1 and why each waits, plus what was deliberately
   ruled out.

The repo's top-level [README](../README.md) covers setup, everyday commands, dependencies and
the manual test scripts.

**The baseline** is the working prototype as of 2026-09-26 (end of Phase 5). These documents
describe it as it is and don't retell how it got there. The earlier planning documents and
decision log are at the git tag `pre-baseline` for anyone who wants the history.

**Keeping them true:** a product or architecture change updates `spine.md`; a stack, schema or
API change updates `build-plan.md`; each deliberate decision gets an entry in `decisions.md`;
`STATUS.md` is updated at the end of each phase.
