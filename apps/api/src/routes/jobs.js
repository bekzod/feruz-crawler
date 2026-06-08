import { discoveryQueue, listingQueue } from "../queues.js";
import { json } from "../json.js";

const queues = { discovery: discoveryQueue, listing: listingQueue };

export async function jobsRoutes(db, request, url) {
  if (request.method === "GET" && url.pathname === "/jobs") {
    const out = {};
    for (const [name, q] of Object.entries(queues)) {
      out[name] = await q.getJobCounts("active", "waiting", "completed", "failed", "delayed");
      const failed = await q.getJobs(["failed"], 0, 20);
      out[`${name}_failed`] = failed.map((j) => ({ id: j.id, name: j.name, reason: j.failedReason, data: j.data }));
    }
    return json(out);
  }
  const retry = url.pathname.match(/^\/jobs\/(discovery|listing)\/([\w:-]+)\/retry$/);
  if (request.method === "POST" && retry) {
    const job = await queues[retry[1]].getJob(retry[2]);
    if (!job) return json({ error: "not found" }, 404);
    await job.retry();
    return json({ ok: true });
  }
  return null;
}
