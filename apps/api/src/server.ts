import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.js";
import { errorToJson } from "./middleware/errorToJson.js";
import { meRoutes } from "./routes/me.js";

const app = new Hono();

app.onError(errorToJson);

// Unauthenticated; for the host's health check.
app.get("/health", (c) => c.json({ ok: true }));

// Everything the clients call lives under /v1. One route file per resource.
const v1 = new Hono();
v1.route("/me", meRoutes);
app.route("/v1", v1);

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
