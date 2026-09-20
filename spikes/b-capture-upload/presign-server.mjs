// Spike B presign server: stands in for the API's presign endpoints using Supabase Storage's REST
// API directly with the service-role key, so the extension does exactly what it will do in
// production (PUT to a signed URL) and nothing else.
//
//   node --env-file=apps/api/.env spikes/b-capture-upload/presign-server.mjs
//
// Endpoints: GET /buckets · POST /presign {bucket,path} · POST /verify {bucket,path} · POST /cleanup
import { createServer } from "node:http";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (pass --env-file=apps/api/.env)",
  );
  process.exit(1);
}
const STORAGE = `${SUPABASE_URL}/storage/v1`;
const authHeaders = {
  authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

async function storage(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${STORAGE}${path}`, {
    method,
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const routes = {
  "GET /buckets": async () => {
    const buckets = await storage("GET", "/bucket");
    return { buckets: buckets.map((b) => b.name) };
  },
  // Same call supabase-js makes in createSignedUploadUrl: returns a relative URL with ?token=.
  // x-upsert on the presign call puts upsert permission in the token, so a retried PUT to the
  // same path replaces the object instead of failing with 409 Duplicate.
  "POST /presign": async ({ bucket, path, upsert = true }) => {
    const signed = await storage(
      "POST",
      `/object/upload/sign/${bucket}/${path}`,
      {},
      upsert ? { "x-upsert": "true" } : {},
    );
    return { uploadUrl: `${STORAGE}${signed.url}`, path };
  },
  "POST /verify": async ({ bucket, path }) => {
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const name = path.slice(path.lastIndexOf("/") + 1);
    const objects = await storage("POST", `/object/list/${bucket}`, {
      prefix: dir,
      limit: 100,
      search: name,
    });
    const found = objects.find((o) => o.name === name);
    if (!found) throw new Error(`object not found after upload: ${path}`);
    return {
      size: Number(found.metadata?.size ?? -1),
      mimetype: found.metadata?.mimetype,
    };
  },
  "POST /cleanup": async () => {
    const objects = await storage("POST", `/object/list/originals`, {
      prefix: "spike",
      limit: 1000,
    });
    const prefixes = objects.map((o) => `spike/${o.name}`);
    if (prefixes.length)
      await storage("DELETE", `/object/originals`, { prefixes });
    return { deleted: prefixes };
  },
};

createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return res.end();
  const key = `${req.method} ${req.url}`;
  const route = routes[key];
  if (!route) {
    res.statusCode = 404;
    return res.end("no such route");
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const result = await route(body ? JSON.parse(body) : {});
    console.log(key, JSON.stringify(result).slice(0, 200));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error(key, err.message);
    res.statusCode = 500;
    res.end(err.message);
  }
}).listen(3999, () =>
  console.log("presign server on http://localhost:3999 →", SUPABASE_URL),
);
