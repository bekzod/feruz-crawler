import { and, eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";

const SOLD_THRESHOLD = 3;

// After a discovery run for `site`, bump the miss counter for active listings of that
// site not present in `seenIds`. Once a listing reaches SOLD_THRESHOLD consecutive
// misses, mark it sold_removed. Listings seen in the run are left untouched (the upsert
// path already reset their counter to 0).
export async function markMisses(db, site, seenIds) {
  const active = await db.select().from(schema.listings)
    .where(and(eq(schema.listings.source, site), eq(schema.listings.status, "active")));
  for (const l of active) {
    if (seenIds.has(l.sourceListingId)) continue;
    const misses = l.consecutiveMisses + 1;
    await db.update(schema.listings)
      .set({ consecutiveMisses: misses, status: misses >= SOLD_THRESHOLD ? "sold_removed" : "active" })
      .where(eq(schema.listings.id, l.id));
  }
}
