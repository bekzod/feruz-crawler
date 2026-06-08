import { and, eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { dictionaries } from "@feruz-crawler/lookup";

function normalizeMaker(value) {
  if (value == null) return value;
  const normalized = String(value).normalize("NFKC").replace(/\s+/g, " ").trim();
  return dictionaries.maker[value] ?? dictionaries.maker[normalized] ?? normalized.toLowerCase();
}

function normalizeListing(canonical) {
  return { ...canonical, maker: normalizeMaker(canonical.maker) };
}

// Upsert a canonical listing by (source, sourceListingId). Inserts new rows (recording
// initial price), updates existing rows in place, and appends to price_history only when
// the observed total price changes. Returns { listing, isNew, priceChanged }.
export async function upsertListing(db, canonical) {
  canonical = normalizeListing(canonical);
  const { source, sourceListingId } = canonical;
  const [existing] = await db.select().from(schema.listings)
    .where(and(eq(schema.listings.source, source), eq(schema.listings.sourceListingId, sourceListingId)))
    .limit(1);

  const newPrice = canonical.totalPrice ?? null;

  if (!existing) {
    const [listing] = await db.insert(schema.listings).values({ ...canonical, status: "active" }).returning();
    if (newPrice != null) await db.insert(schema.priceHistory).values({ listingId: listing.id, price: newPrice });
    return { listing, isNew: true, priceChanged: false };
  }

  const priceChanged = newPrice != null && existing.totalPrice !== newPrice;
  const [listing] = await db.update(schema.listings)
    .set({ ...canonical, status: "active", consecutiveMisses: 0, lastSeenAt: new Date() })
    .where(eq(schema.listings.id, existing.id))
    .returning();
  if (priceChanged) await db.insert(schema.priceHistory).values({ listingId: listing.id, price: newPrice });
  return { listing, isNew: false, priceChanged };
}
