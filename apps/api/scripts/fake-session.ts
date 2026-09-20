// Runs the Phase 2 backend end to end without the extension (build plan, Phase 2 done-criterion):
// signs in with an email/password user, creates a session, uploads one spoken WAV as an audio
// chunk and three PNGs as captures through the real presign → PUT → register routes, stops the
// session, waits for the worker to transcribe, and prints the summary and the transcript with
// [CAPTURE n] markers where the captures landed.
//
//   FAKE_EMAIL=you@example.com FAKE_PASSWORD=... pnpm --filter @teardown/api fake-session [--delete]
//
// Needs the API (pnpm --filter @teardown/api dev) and the worker (pnpm --filter @teardown/api
// dev:worker) running, and SUPABASE_ANON_KEY in .env. Fixtures are generated on the fly with
// macOS `say` and `afconvert` into scripts/fixtures/ (gitignored). --delete removes the session
// at the end and checks that its objects are gone.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { insertCaptureMarkers } from "@teardown/core/markers";
import { listTranscriptWordsForSession } from "../src/db/queries/transcriptWords.js";
import { sql } from "../src/db/client.js";
import { storage, BUCKETS } from "../src/storage/client.js";
import { sessionPrefix } from "../src/storage/objectKeys.js";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const FAKE_EMAIL = process.env.FAKE_EMAIL;
const FAKE_PASSWORD = process.env.FAKE_PASSWORD;
const shouldDelete = process.argv.includes("--delete");

const NARRATION =
  "Okay, so this is the competitor's pricing page. The first thing I notice is that the " +
  "pricing table is buried under an accordion, which you would never find unless you scrolled. " +
  "Let me capture this. Now look at the enterprise tier: there is no price, just a contact " +
  "sales button, and the feature list is much longer than the other two. Capturing that too. " +
  "And finally the checkout flow asks for a credit card before the trial starts, which is " +
  "the opposite of what we do. One more capture. That is the whole pricing story.";

const fixturesDir = path.join(import.meta.dirname, "fixtures");

async function main() {
  if (!SUPABASE_ANON_KEY || !FAKE_EMAIL || !FAKE_PASSWORD) {
    fail("Set SUPABASE_ANON_KEY (in .env), FAKE_EMAIL and FAKE_PASSWORD");
  }
  const token = await signIn(FAKE_EMAIL, FAKE_PASSWORD);
  const api = apiClient(token);
  const wav = makeNarrationWav();
  log(
    `narration: ${(wav.bytes.length / 1024).toFixed(0)} KB, ${(wav.durationMs / 1000).toFixed(1)} s`,
  );

  // 1. Session at "now"; every timestamp below is relative to this epoch.
  const { session } = await api("POST", "/v1/sessions", {
    startedAt: new Date().toISOString(),
  });
  log(`session ${session.id} (${session.status})`);

  // 2. One audio chunk at offset 0 (the extension will send 15–30 s chunks).
  const chunkPresign = await api(
    "POST",
    `/v1/sessions/${session.id}/chunks/presign`,
    { offsetMs: 0 },
  );
  await put(chunkPresign.uploadUrl, wav.bytes, "audio/wav");
  const { chunk } = await api("POST", `/v1/sessions/${session.id}/chunks`, {
    offsetMs: 0,
    durationMs: wav.durationMs,
    path: chunkPresign.path,
  });
  log(`chunk ${chunk.id} registered (${chunk.status}); transcription queued`);

  // 3. Three captures, timed to land inside the narration (see NARRATION).
  const captureTimes = [4_000, 11_000, 18_000];
  for (const [i, tCapture] of captureTimes.entries()) {
    const id = crypto.randomUUID();
    const png = solidPng(800, 600, [40 + i * 60, 120, 200 - i * 60]);
    const presign = await api(
      "POST",
      `/v1/sessions/${session.id}/captures/presign`,
      { captureId: id },
    );
    await put(presign.uploadUrl, png, "image/png");
    await api("POST", `/v1/sessions/${session.id}/captures`, {
      id,
      tPickStart: tCapture - 1_500,
      tCapture,
      url: "https://example.com/pricing",
      pageTitle: "Pricing — Example",
      viewport: { w: 1440, h: 900, dpr: 2 },
      region:
        i === 1
          ? { mode: "freehand", rect: { x: 100, y: 200, w: 600, h: 300 } }
          : { mode: "viewport" },
      originalPath: presign.path,
      elementTextHash: null,
    });
    log(`capture ${i + 1} at t=${tCapture} ms uploaded and registered`);
  }

  // 4. Stop → review.
  const stopped = await api("POST", `/v1/sessions/${session.id}/stop`, {
    stoppedAt: new Date().toISOString(),
    pausedMs: 0,
  });
  log(`stopped (${stopped.session.status})`);

  // 5. Wait for the worker.
  const summary = await waitForWords(api, session.id);
  log(`summary: ${summary.captureCount} captures, ${summary.wordCount} words`);

  // 6. The transcript as the generate job will see it (spine §9.2).
  const detail = await api("GET", `/v1/sessions/${session.id}`);
  const words = await listTranscriptWordsForSession(session.id);
  const captures = detail.captures.map((c: { tCapture: number }) => ({
    tCapture: c.tCapture,
  }));
  console.log("\n" + insertCaptureMarkers(words, captures) + "\n");

  const checks = [
    summary.captureCount === 3
      ? "captureCount = 3 ✓"
      : `captureCount = ${summary.captureCount} ✗`,
    summary.wordCount > 40
      ? `wordCount = ${summary.wordCount} ✓`
      : `wordCount = ${summary.wordCount} ✗ (expected > 40)`,
  ];
  log(checks.join("; "));

  // 7. Optionally delete and prove the cascade.
  if (shouldDelete) {
    await api("DELETE", `/v1/sessions/${session.id}`);
    const gone = await api(
      "GET",
      `/v1/sessions/${session.id}`,
      undefined,
      [404],
    );
    const leftovers = await countObjects(session.userId, session.id);
    const rows = await sql<{ n: number }[]>`
      select (
        (select count(*) from captures where session_id = ${session.id}) +
        (select count(*) from audio_chunks where session_id = ${session.id}) +
        (select count(*) from transcript_words where session_id = ${session.id})
      )::int as n
    `;
    log(
      `deleted: GET → ${gone.status}; objects left in storage: ${leftovers}; rows left: ${rows[0]!.n}`,
    );
  } else {
    log(
      `kept. Delete with: curl -X DELETE -H "Authorization: Bearer $TOKEN" ${API_URL}/v1/sessions/${session.id}`,
    );
  }
  await sql.end();
}

// ---- helpers ----------------------------------------------------------------------------------

function log(line: string) {
  console.log(`[fake-session] ${line}`);
}
function fail(message: string): never {
  console.error(`[fake-session] ${message}`);
  process.exit(1);
}

// Supabase's password grant; the README describes creating this user in the dashboard.
async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) fail(`sign-in failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

// A tiny typed-enough client: throws on any status not in `okStatuses`, returns parsed JSON
// (or { status } for empty bodies).
function apiClient(token: string) {
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
        authorization: `Bearer ${token}`,
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

async function put(url: string, bytes: Uint8Array, contentType: string) {
  // A Blob is the body type fetch's typings and every runtime agree on.
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: new Blob([bytes as BlobPart], { type: contentType }),
  });
  if (!res.ok)
    fail(`PUT ${url.split("?")[0]} → ${res.status} ${await res.text()}`);
}

async function waitForWords(
  api: ReturnType<typeof apiClient>,
  sessionId: string,
) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const summary = await api("GET", `/v1/sessions/${sessionId}/summary`);
    if (summary.wordCount > 0) return summary;
    await new Promise((r) => setTimeout(r, 2_000));
    process.stdout.write(".");
  }
  return fail(
    "no words after 120 s — is the worker running? (pnpm --filter @teardown/api dev:worker)",
  );
}

async function countObjects(
  userId: string,
  sessionId: string,
): Promise<number> {
  let n = 0;
  for (const bucket of [BUCKETS.originals, BUCKETS.crops, BUCKETS.audio]) {
    const { data } = await storage
      .from(bucket)
      .list(sessionPrefix(userId, sessionId), { limit: 100 });
    n += (data ?? []).length;
  }
  return n;
}

// A spoken WAV from macOS `say`, converted to 16 kHz mono PCM. Cached in scripts/fixtures/.
function makeNarrationWav(): { bytes: Uint8Array; durationMs: number } {
  mkdirSync(fixturesDir, { recursive: true });
  const aiff = path.join(fixturesDir, "narration.aiff");
  const wav = path.join(fixturesDir, "narration.wav");
  if (!existsSync(wav)) {
    if (process.platform !== "darwin")
      fail(
        "fixture generation uses macOS `say`; put a narration.wav in scripts/fixtures/",
      );
    execFileSync("say", ["-o", aiff, NARRATION]);
    execFileSync("afconvert", [
      "-f",
      "WAVE",
      "-d",
      "LEI16@16000",
      "-c",
      "1",
      aiff,
      wav,
    ]);
  }
  const bytes = readFileSync(wav);
  // 16-bit mono at 16 kHz: 32,000 bytes per second, after the 44-byte header.
  const durationMs = Math.round(((bytes.length - 44) / 32_000) * 1000);
  return { bytes, durationMs };
}

// A solid-colour PNG, encoded by hand so the fixture needs no screen-recording permission and
// no image library. Written to scripts/fixtures/ so you can open one and see it is a real PNG.
function solidPng(
  width: number,
  height: number,
  [r, g, b]: [number, number, number],
): Uint8Array {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, RGB, no interlace
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path.join(fixturesDir, `capture-${r}-${g}-${b}.png`), png);
  return png;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

await main();
