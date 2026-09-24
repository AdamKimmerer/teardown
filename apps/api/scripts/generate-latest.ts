// The Phase 4 done-criterion without a web app: runs Generate on your most recent stopped
// session through the real API, waits for the worker, prints the document and checks that every
// [IMAGE_n] resolves to an image, then tries a refine that breaks the output contract (expects
// 422 and no new version) and one that keeps it (expects version 2).
//
//   pnpm --filter @teardown/api generate-latest [--session <id>] [--no-refine]
//
// Needs the API and worker running and a credit on the session owner's balance (grant-credits).
// Calls the API as the session's owner via scripts/devAccessToken.ts (local development only).
// The document is also written to scripts/output/<session>-v<n>.md for easier reading.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { imagePlaceholders } from "@teardown/core/outputContract";
import { sql } from "../src/db/client.js";
import { devAccessToken, revokeDevAccessToken } from "./devAccessToken.js";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const outputDir = path.join(import.meta.dirname, "output");

const target = await pickSession(arg("--session"));
log(`session ${target.id} (${target.status}) owned by ${target.email}`);
const token = await devAccessToken(target.email);
const api = apiClient(token);

try {
  // 1. Generate and wait.
  const queued = await api(
    "POST",
    `/v1/sessions/${target.id}/generate`,
    undefined,
    [202, 402],
  );
  if (queued.status === 402)
    fail(
      `out of credits — run: pnpm --filter @teardown/api grant-credits --email ${target.email}`,
    );
  const detail = await waitForReady(target.id);

  // 2. The document, and the image check.
  const doc = await api("GET", `/v1/documents/${detail.documentId}`);
  const markdown: string = doc.currentVersion.markdown;
  save(target.id, 1, markdown);
  console.log("\n" + markdown + "\n");
  const placed = imagePlaceholders(markdown);
  const resolvable = new Set(doc.images.map((image: { n: number }) => image.n));
  const unresolved = placed.filter((n) => !resolvable.has(n));
  const duplicated = placed.filter((n, i) => placed.indexOf(n) !== i);
  log(
    `${placed.length} image placeholders for ${doc.images.length} captures; unresolved: ${unresolved.join(",") || "none"}; duplicated: ${duplicated.join(",") || "none"} ${unresolved.length + duplicated.length === 0 && placed.length === doc.images.length ? "✓" : "✗"}`,
  );
  await printUsage(target.id);

  // 3. Refine: one that must be rejected, one that must be kept.
  if (!process.argv.includes("--no-refine")) {
    const bad = await api(
      "POST",
      `/v1/documents/${doc.document.id}/refine`,
      {
        prompt:
          "Remove every image and cut the whole document down to one sentence.",
      },
      [201, 422],
    );
    const afterBad = await api("GET", `/v1/documents/${doc.document.id}`);
    log(
      `contract-breaking refine → ${bad.status} (${bad.error?.message ?? "saved!"}); versions now ${afterBad.versions.length} ${bad.status === 422 && afterBad.versions.length === 1 ? "✓" : "✗"}`,
    );

    const good = await api(
      "POST",
      `/v1/documents/${doc.document.id}/refine`,
      {
        prompt: "Make the Summary section a little more concise.",
      },
      [201, 422],
    );
    if (good.status === 201)
      save(target.id, good.version.versionNo, good.version.markdown);
    log(
      `ordinary refine → ${good.status}${good.status === 201 ? ` (version ${good.version.versionNo}) ✓` : ` (${good.error.message}) — rejected by the contract; try a different wording`}`,
    );
  }
  log(`documents written to ${outputDir}`);
} finally {
  await revokeDevAccessToken(token);
  await sql.end();
}

// ---- helpers ----------------------------------------------------------------------------------

async function pickSession(id: string | undefined) {
  const rows = id
    ? await sql<{ id: string; status: string; email: string }[]>`
        select s.id, s.status, u.email from sessions s join users u on u.id = s.user_id
        where s.id = ${id}`
    : await sql<{ id: string; status: string; email: string }[]>`
        select s.id, s.status, u.email from sessions s join users u on u.id = s.user_id
        where s.status in ('review', 'failed')
        order by s.created_at desc
        limit 1`;
  if (rows.length === 0)
    fail(
      "no stopped session found — record one with the extension and press Stop",
    );
  return rows[0]!;
}

async function waitForReady(sessionId: string) {
  const deadline = Date.now() + 10 * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const detail = await api("GET", `/v1/sessions/${sessionId}`);
    const status = detail.session.status;
    if (status !== last) log(`status: ${status}`);
    last = status;
    if (status === "ready") return detail;
    if (status === "failed")
      fail(
        `generation failed at step "${detail.session.failedStep}" (see the worker's log)`,
      );
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return fail("still not ready after 10 minutes");
}

async function printUsage(sessionId: string) {
  const rows = await sql`
    select kind, model, input_tokens, output_tokens, image_count, image_pixels, cost_usd_estimate
    from usage_events
    where session_id = ${sessionId} and kind = 'generate'
    order by created_at desc
    limit 1
  `;
  const u = rows[0];
  if (!u) return;
  const pixels = (u.image_pixels as { w: number; h: number }[])
    .map((p) => `${p.w}×${p.h}`)
    .join(", ");
  log(
    `generate: ${u.model}, ${u.input_tokens} in / ${u.output_tokens} out tokens, ${u.image_count} images (${pixels}), ≈ $${Number(u.cost_usd_estimate).toFixed(4)}`,
  );
}

function save(sessionId: string, versionNo: number, markdown: string) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, `${sessionId}-v${versionNo}.md`),
    markdown,
  );
}

function apiClient(accessToken: string) {
  return async function api(
    method: string,
    route: string,
    body?: unknown,
    okStatuses: number[] = [200, 201, 202, 204],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const res = await fetch(`${API_URL}${route}`, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!okStatuses.includes(res.status))
      fail(`${method} ${route} → ${res.status} ${text}`);
    return text
      ? { status: res.status, ...JSON.parse(text) }
      : { status: res.status };
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
function log(line: string) {
  console.log(`[generate-latest] ${line}`);
}
function fail(message: string): never {
  console.error(`[generate-latest] ${message}`);
  process.exit(1);
}
