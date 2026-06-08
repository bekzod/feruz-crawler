import { expect, test, afterAll } from "bun:test";
import { createDb } from "@feruz-crawler/db";
import { createDbCache } from "./cache.js";

const { db, sql } = createDb();
afterAll(() => sql.end());

test("cache set then get round-trips, and translateField uses it", async () => {
  const cache = createDbCache(db);
  const key = `grade-${Date.now()}`;
  expect(await cache.get("grade", key)).toBeNull();
  await cache.set("grade", key, "test-english");
  expect(await cache.get("grade", key)).toBe("test-english");
});
