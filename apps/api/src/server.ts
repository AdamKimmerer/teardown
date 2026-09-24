import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { errorToJson } from "./middleware/errorToJson.js";
import { createBoss, ensureQueues } from "./queue/boss.js";
import { captureRoutes } from "./routes/captures.js";
import { chunkRoutes } from "./routes/chunks.js";
import { documentRoutes } from "./routes/documents.js";
import { generateRoutes } from "./routes/generate.js";
import { meRoutes } from "./routes/me.js";
import { sessionRoutes } from "./routes/sessions.js";

// The API's queue client: it only sends jobs; the worker process runs them.
const boss = createBoss("api");
boss.on("error", (err) => console.error("pg-boss error", err));
await boss.start();
await ensureQueues(boss);

const app = new Hono();

app.onError(errorToJson);

// Unauthenticated; for the host's health check.
app.get("/health", (c) => c.json({ ok: true }));

// The web app is on another origin, so the browser needs CORS. The extension's requests come
// from its service worker with host permissions, which CORS does not apply to.
app.use(
  "/v1/*",
  cors({
    origin: config.WEB_APP_URL,
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    maxAge: 600,
  }),
);

// Everything the clients call lives under /v1. One route file per resource.
const v1 = new Hono();
v1.route("/me", meRoutes);
v1.route("/sessions", sessionRoutes);
v1.route("/sessions/:id/captures", captureRoutes);
v1.route("/sessions/:id/chunks", chunkRoutes(boss));
v1.route("/sessions/:id/generate", generateRoutes(boss));
v1.route("/documents", documentRoutes);
app.route("/v1", v1);

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
