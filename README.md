# Teardown

Narrate a walkthrough of a competitor's product, capture screenshots on demand, and get a
structured document that lands where your team works.

> **Status:** in active development, heading for a private beta. The capture, transcription,
> generation and web app are built; billing, exports and deployment are next. See
> [ROADMAP.md](ROADMAP.md) for the work ahead.

## The problem

Competitive walkthroughs end up either unstructured (screen recordings and voice memos that are
hard to share or reference later) or over-structured (manual notes, slow enough to break the
flow of analysis). Teardown lets you talk freely while you click through someone else's product,
then turns the narration and screenshots into a document you can refine and export.

It's built for PMs, consultants, sales teams and designers doing web-based competitive analysis.

## How it works

1. **Record.** A Chrome extension's side panel records your narration. Capture the whole
   viewport or a region you draw on the page, with a button or ⌘⇧S.
2. **Transcribe.** Audio uploads in chunks during the session and is transcribed with word
   timestamps, so each capture lands at the right moment in the transcript.
3. **Generate.** One vision-model call reads the marked transcript and the screenshots and
   writes a structured teardown, with images placed where you talked about them.
4. **Refine.** Ask for changes in plain language. Every change is a new version in a tree you
   can step back through; the model can propose a web search and runs it only with your
   approval.
5. **Export** (planned). Self-contained HTML, a Markdown/Obsidian ZIP, or a push to Notion.

A few rules shape the design:

- **The recording is scaffolding.** No live transcript, clock or word count while you talk;
  nobody hears the dead air.
- **Store the source, derive everything else.** Each capture is the untouched original plus a
  record of what you chose; crops, model inputs and exports can be regenerated at any time.
- **The extension captures; the web app is where work happens.** The extension stays small
  because every change goes through Web Store review.
- **No API keys in any client.** Prompts and model calls live on the server.
- **Delete means delete.** Deleting a capture, session or account removes the rows and the
  stored files. No soft delete.

## Architecture

```
Chrome extension ──┐                         ┌── Supabase Postgres (data + job queue)
  side panel       │                         │
  content script   ├──► API (Hono, Node 22) ─┼── Supabase Storage (audio, screenshots)
  offscreen mic    │         │               │
Web app (React) ───┘         ▼               └── Supabase Auth (Google sign-in)
                     Worker (pg-boss) ──► OpenAI (transcription, vision model)
```

One TypeScript monorepo (pnpm workspaces):

```
packages/core/        shared Zod schemas, API contract, session clock, markers, crop math, output contract
apps/api/             Hono HTTP API + pg-boss worker
apps/extension/       Chrome MV3 extension: side panel, content script, offscreen recorder
apps/web/             Vite + React web app
supabase/migrations/  the database schema
docs/                 product spec, build plan, status, decisions, backlog, development guide
```

## Tech stack

TypeScript throughout · Zod · Hono on Node 22 · Postgres via `postgres.js` with hand-written SQL
· pg-boss · Supabase (Postgres, Auth, Storage) · OpenAI (Whisper, a vision model, web search) ·
sharp · React, React Router and TanStack Query · Chrome MV3 · Vitest · Stripe (planned).

## Documentation

- [ROADMAP.md](ROADMAP.md): the work ahead, phase by phase, then after launch.
- [docs/STATUS.md](docs/STATUS.md): where the build is right now.
- [docs/spine.md](docs/spine.md): the product and its architecture, and why.
- [docs/build-plan.md](docs/build-plan.md): the engineering reference.
- [docs/decisions.md](docs/decisions.md): each decision and its reason.
- [docs/backlog.md](docs/backlog.md): ideas beyond v1, and what was ruled out.
- [docs/development.md](docs/development.md): local setup, commands and manual test scripts.

## License

[Mozilla Public License 2.0](LICENSE).
