import { expect, test, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@feruz-crawler/db";
import { markMisses } from "./soldDetection.js";

const { db, sql } = createDb();
afterAll(() => sql.end());

async function makeListing(id, misses = 0) {
  const [l] = await db.insert(schema.listings).values({
    source: "goonet", sourceListingId: id, url: "http://x", status: "active", consecutiveMisses: misses
  }).returning();
  return l;
}

test("missing listing increments; reaching 3 flips to sold_removed", async () => {
  const l = await makeListing(`s-${Date.now()}-${Math.random()}`, 2);
  await markMisses(db, "goonet", new Set()); // empty seen set -> it's a miss
  const [after] = await db.select().from(schema.listings).where(eq(schema.listings.id, l.id));
  expect(after.consecutiveMisses).toBe(3);
  expect(after.status).toBe("sold_removed");
});

test("seen listing is not incremented", async () => {
  const l = await makeListing(`s2-${Date.now()}-${Math.random()}`, 2);
  await markMisses(db, "goonet", new Set([l.sourceListingId]));
  const [after] = await db.select().from(schema.listings).where(eq(schema.listings.id, l.id));
  expect(after.consecutiveMisses).toBe(2);
  expect(after.status).toBe("active");
});
