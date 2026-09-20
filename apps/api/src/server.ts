import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.js";
import { errorToJson } from "./middleware/errorToJson.js";
import { createBoss, ensureQueues } from "./queue/boss.js";
import { captureRoutes } from "./routes/captures.js";
import { chunkRoutes } from "./routes/chunks.js";
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

// Everything the clients call lives under /v1. One route file per resource.
const v1 = new Hono();
v1.route("/me", meRoutes);
v1.route("/sessions", sessionRoutes);
v1.route("/sessions/:id/captures", captureRoutes);
v1.route("/sessions/:id/chunks", chunkRoutes(boss));
app.route("/v1", v1);

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
