import { expect, test } from "bun:test";
import {
  countUnreadNotifications,
  flattenFailedJobs,
  summarizeJobs,
  summarizeListings,
  summarizePresets,
} from "./dashboard.js";

test("summarizeJobs totals queue work and failures across crawler queues", () => {
  const summary = summarizeJobs({
    discovery: { active: 2, waiting: 3, delayed: 1, completed: 8, failed: 1 },
    listing: { active: 4, waiting: 5, delayed: 0, completed: 10, failed: 2 },
    discovery_failed: [{ id: "d1" }],
    listing_failed: [{ id: "l1" }, { id: "l2" }],
  });

  expect(summary.active).toBe(6);
  expect(summary.waiting).toBe(8);
  expect(summary.delayed).toBe(1);
  expect(summary.failed).toBe(3);
  expect(summary.hasFailures).toBe(true);
});

test("summarizeJobs tolerates missing job data during initial render", () => {
  expect(summarizeJobs(null)).toEqual({
    active: 0,
    waiting: 0,
    delayed: 0,
    completed: 0,
    failed: 0,
    hasFailures: false,
  });
});

test("summarizePresets separates enabled crawls from paused presets", () => {
  const summary = summarizePresets([
    { enabled: true },
    { enabled: false },
    { enabled: true },
  ]);

  expect(summary.total).toBe(3);
  expect(summary.enabled).toBe(2);
  expect(summary.paused).toBe(1);
});

test("countUnreadNotifications counts items without readAt timestamps", () => {
  expect(countUnreadNotifications([
    { n: { readAt: null } },
    { n: { readAt: "2026-06-12T08:00:00Z" } },
    { n: {} },
  ])).toBe(2);
});

test("summarizeListings reports active and sold inventory", () => {
  const summary = summarizeListings([
    { status: "active" },
    { status: "active" },
    { status: "sold_removed" },
  ]);

  expect(summary.total).toBe(3);
  expect(summary.active).toBe(2);
  expect(summary.sold).toBe(1);
});

test("flattenFailedJobs attaches the queue name to each failure", () => {
  expect(flattenFailedJobs({
    discovery_failed: [{ id: "d1", reason: "search timeout" }],
    listing_failed: [{ id: "l1", reason: "parse error" }],
  })).toEqual([
    { id: "d1", queue: "discovery", reason: "search timeout" },
    { id: "l1", queue: "listing", reason: "parse error" },
  ]);
});

test("flattenFailedJobs tolerates missing job data during initial render", () => {
  expect(flattenFailedJobs(null)).toEqual([]);
});
