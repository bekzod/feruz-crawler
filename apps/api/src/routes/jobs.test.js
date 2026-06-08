import { expect, test } from "bun:test";
import { makeJobsRoutes } from "./jobs.js";

function never() {
  return new Promise(() => {});
}

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json()
  };
}

test("GET /jobs returns 503 when queue inspection times out", async () => {
  const jobsRoutes = makeJobsRoutes({
    discovery: {
      getJobCounts: never
    },
    listing: {
      getJobCounts: async () => ({ waiting: 0 }),
      getJobs: async () => []
    }
  }, { timeoutMs: 5 });

  const response = await jobsRoutes(null, new Request("http://localhost/jobs"), new URL("http://localhost/jobs"));

  expect(await readJson(response)).toEqual({
    status: 503,
    body: {
      error: "Job queues unavailable",
      queue: "discovery"
    }
  });
});
