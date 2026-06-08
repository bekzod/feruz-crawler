import { createDb } from "@feruz-crawler/db";
import { json } from "./json.js";
import { presetsRoutes } from "./routes/presets.js";
import { listingsRoutes } from "./routes/listings.js";
import { crawlRoutes } from "./routes/crawl.js";
import { jobsRoutes } from "./routes/jobs.js";
import { notificationsRoutes } from "./routes/notifications.js";
import { makersRoutes } from "./routes/makers.js";

const port = Number(process.env.PORT ?? 3000);
const { db } = createDb();
const routes = [makersRoutes, presetsRoutes, listingsRoutes, crawlRoutes, jobsRoutes, notificationsRoutes];

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({});
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });
    for (const route of routes) {
      try {
        const res = await route(db, request, url);
        if (res) return res;
      } catch (err) {
        return json({ error: String(err?.message ?? err) }, 400);
      }
    }
    return json({ error: "Not found" }, 404);
  }
});
console.log(`feruz-crawler API listening on http://localhost:${server.port}`);
