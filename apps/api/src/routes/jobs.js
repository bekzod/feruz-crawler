import { json } from "../json.js";

const DEFAULT_QUEUE_TIMEOUT_MS = Number(process.env.JOBS_QUEUE_TIMEOUT_MS ?? 2000);
let defaultJobsRoutes;

class QueueTimeoutError extends Error {
  constructor(queue) {
    super("Job queues unavailable");
    this.queue = queue;
  }
}

function withTimeout(promise, timeoutMs, queue) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new QueueTimeoutError(queue)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timeout));
}

export function makeJobsRoutes(routeQueues, { timeoutMs = DEFAULT_QUEUE_TIMEOUT_MS } = {}) {
  return async function jobsRoutes(db, request, url) {
    if (request.method === "GET" && url.pathname === "/jobs") {
      const out = {};
      for (const [name, q] of Object.entries(routeQueues)) {
        try {
          out[name] = await withTimeout(q.getJobCounts("active", "waiting", "completed", "failed", "delayed"), timeoutMs, name);
          const failed = await withTimeout(q.getJobs(["failed"], 0, 20), timeoutMs, name);
          out[`${name}_failed`] = failed.map((j) => ({ id: j.id, name: j.name, reason: j.failedReason, data: j.data }));
        } catch (err) {
          return json({ error: "Job queues unavailable", queue: err?.queue ?? name }, 503);
        }
      }
      return json(out);
    }
    const retry = url.pathname.match(/^\/jobs\/(discovery|listing)\/([\w:-]+)\/retry$/);
    if (request.method === "POST" && retry) {
      const job = await routeQueues[retry[1]].getJob(retry[2]);
      if (!job) return json({ error: "not found" }, 404);
      await job.retry();
      return json({ ok: true });
    }
    return null;
  };
}

async function getDefaultJobsRoutes() {
  if (!defaultJobsRoutes) {
    const { discoveryQueue, listingQueue } = await import("../queues.js");
    defaultJobsRoutes = makeJobsRoutes({ discovery: discoveryQueue, listing: listingQueue });
  }
  return defaultJobsRoutes;
}

export async function jobsRoutes(db, request, url) {
  return (await getDefaultJobsRoutes())(db, request, url);
}
