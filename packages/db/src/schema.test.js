import { expect, test, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, schema } from "./index.js";

const { db, sql } = createDb();
afterAll(() => sql.end());

test("can insert and read a listing", async () => {
  const [row] = await db.insert(schema.listings).values({
    source: "goonet", sourceListingId: `t-${Date.now()}`, url: "http://x", maker: "toyota"
  }).returning();
  expect(row.maker).toBe("toyota");
  await db.delete(schema.listings).where(eq(schema.listings.id, row.id));
});
