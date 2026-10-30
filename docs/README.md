# Teardown docs

Read in this order when joining the project:

1. **[STATUS.md](STATUS.md)**: where the build is right now, what's next, how to run it.
2. **[spine.md](spine.md)**: the product and its architecture. What Teardown does, the principles
   it follows, and why each part works the way it does.
3. **[build-plan.md](build-plan.md)**: the engineering reference. How work is run, the stack,
   repo layout, conventions, schema, API, the remaining phases, and the platform facts the code
   relies on.
4. **[decisions.md](decisions.md)**: decisions as they are made, one entry each with the reason.
5. **[backlog.md](backlog.md)**: ideas beyond v1 and why each waits, plus what was deliberately
   ruled out.

**[development.md](development.md)** covers setup from a fresh clone, everyday commands,
dependencies and the manual test scripts. The work ahead is in [ROADMAP.md](../ROADMAP.md).

**Keeping them true:** a product or architecture change updates `spine.md`; a stack, schema or
API change updates `build-plan.md`; each deliberate decision gets an entry in `decisions.md`;
`STATUS.md` is updated at the end of each phase.
