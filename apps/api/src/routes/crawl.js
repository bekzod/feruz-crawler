import { getAdapterForUrl } from "@feruz-crawler/crawler/adapters";
import { JOB_CRAWL_LISTING } from "@feruz-crawler/shared";
import { listingQueue } from "../queues.js";
import { json, body } from "../json.js";

export async function crawlRoutes(db, request, url) {
  if (request.method === "POST" && url.pathname === "/crawl/url") {
    const { url: target } = await body(request);
    if (!target) return json({ error: "url required" }, 400);
    const adapter = getAdapterForUrl(target);
    if (!adapter) return json({ error: "unsupported site" }, 400);
    const job = await listingQueue.add(JOB_CRAWL_LISTING, { site: adapter.site, url: target });
    return json({ jobId: job.id, site: adapter.site }, 202);
  }
  return null;
}
