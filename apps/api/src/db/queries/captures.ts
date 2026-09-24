import type { Capture, Rect, RegionMode } from "@teardown/core/schemas/capture";
import type { UpsertCaptureRequest } from "@teardown/core/api-contract";
import { sql } from "../client.js";

type CaptureRow = {
  id: string;
  session_id: string;
  t_pick_start_ms: number;
  t_capture_ms: number;
  url: string;
  page_title: string;
  viewport_w: number;
  viewport_h: number;
  dpr: number;
  region_mode: RegionMode;
  region_rect: Rect | null;
  selectors: string[];
  primary_element: string | null;
  padding: number;
  original_path: string | null;
  crop_path: string | null;
  element_text_hash: string | null;
  created_at: Date;
};

const columns = sql`
  id, session_id, t_pick_start_ms, t_capture_ms, url, page_title, viewport_w, viewport_h, dpr,
  region_mode, region_rect, selectors, primary_element, padding, original_path, crop_path,
  element_text_hash, created_at
`;

// Flat columns back into the nested record the clients use (spine §10.1).
function captureFromRow(row: CaptureRow): Capture {
  return {
    id: row.id,
    sessionId: row.session_id,
    tPickStart: row.t_pick_start_ms,
    tCapture: row.t_capture_ms,
    url: row.url,
    pageTitle: row.page_title,
    viewport: { w: row.viewport_w, h: row.viewport_h, dpr: row.dpr },
    region: {
      mode: row.region_mode,
      rect: row.region_rect ?? undefined,
      selectors: row.selectors,
      primaryElement: row.primary_element ?? undefined,
      padding: row.padding,
    },
    originalPath: row.original_path,
    cropPath: row.crop_path,
    elementTextHash: row.element_text_hash,
    createdAt: row.created_at.toISOString(),
  };
}

// Insert or, on a retried upload of the same client id, replace. crop_path is left alone
// because it is a derived cache the client never owns.
export async function upsertCapture(
  sessionId: string,
  input: UpsertCaptureRequest,
): Promise<Capture> {
  const rows = await sql<CaptureRow[]>`
    insert into captures (
      id, session_id, t_pick_start_ms, t_capture_ms, url, page_title, viewport_w, viewport_h, dpr,
      region_mode, region_rect, selectors, primary_element, padding, original_path, element_text_hash
    )
    values (
      ${input.id}, ${sessionId}, ${input.tPickStart}, ${input.tCapture}, ${input.url},
      ${input.pageTitle}, ${input.viewport.w}, ${input.viewport.h}, ${input.viewport.dpr},
      ${input.region.mode}, ${input.region.rect ? sql.json(input.region.rect) : null},
      ${input.region.selectors}, ${input.region.primaryElement ?? null}, ${input.region.padding},
      ${input.originalPath}, ${input.elementTextHash}
    )
    on conflict (id) do update set
      t_pick_start_ms = excluded.t_pick_start_ms,
      t_capture_ms = excluded.t_capture_ms,
      url = excluded.url,
      page_title = excluded.page_title,
      viewport_w = excluded.viewport_w,
      viewport_h = excluded.viewport_h,
      dpr = excluded.dpr,
      region_mode = excluded.region_mode,
      region_rect = excluded.region_rect,
      selectors = excluded.selectors,
      primary_element = excluded.primary_element,
      padding = excluded.padding,
      original_path = excluded.original_path,
      element_text_hash = excluded.element_text_hash
    where captures.session_id = excluded.session_id
    returning ${columns}
  `;
  return captureFromRow(rows[0]!);
}

// Captures in the order they were taken, which is also the order images are numbered.
export async function listCapturesForSession(
  sessionId: string,
): Promise<Capture[]> {
  const rows = await sql<CaptureRow[]>`
    select ${columns}
    from captures
    where session_id = ${sessionId}
    order by t_capture_ms, created_at
  `;
  return rows.map(captureFromRow);
}

export async function findCapture(
  sessionId: string,
  captureId: string,
): Promise<Capture | null> {
  const rows = await sql<CaptureRow[]>`
    select ${columns}
    from captures
    where id = ${captureId}
      and session_id = ${sessionId}
  `;
  return rows[0] ? captureFromRow(rows[0]) : null;
}

export async function countCapturesForSession(
  sessionId: string,
): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select count(*)::int as count
    from captures
    where session_id = ${sessionId}
  `;
  return rows[0]?.count ?? 0;
}

// The row only; the caller deletes the objects first.
export async function deleteCapture(
  sessionId: string,
  captureId: string,
): Promise<void> {
  await sql`
    delete from captures
    where id = ${captureId}
      and session_id = ${sessionId}
  `;
}

// Records where a capture's derived crop was stored (a cache: it can always be re-derived).
export async function setCropPath(
  captureId: string,
  cropPath: string,
): Promise<void> {
  await sql`
    update captures
    set crop_path = ${cropPath}
    where id = ${captureId}
  `;
}
