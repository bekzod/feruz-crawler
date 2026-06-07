import { and, desc, eq, gte, lte } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { json } from "../json.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listingsRoutes(db, request, url) {
  const detail = url.pathname.match(/^\/listings\/([\w-]+)$/);
  if (request.method === "GET" && detail) {
    const id = detail[1];
    if (!UUID_RE.test(id)) return json({ error: "not found" }, 404);
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, id));
    if (!listing) return json({ error: "not found" }, 404);
    const prices = await db.select().from(schema.priceHistory)
      .where(eq(schema.priceHistory.listingId, id)).orderBy(schema.priceHistory.observedAt);
    return json({ ...listing, priceHistory: prices });
  }
  if (request.method === "GET" && url.pathname === "/listings") {
    const q = url.searchParams;
    const conds = [];
    if (q.get("source")) conds.push(eq(schema.listings.source, q.get("source")));
    if (q.get("maker")) conds.push(eq(schema.listings.maker, q.get("maker")));
    if (q.get("status")) conds.push(eq(schema.listings.status, q.get("status")));
    if (q.get("priceMax")) conds.push(lte(schema.listings.totalPrice, Number(q.get("priceMax"))));
    if (q.get("priceMin")) conds.push(gte(schema.listings.totalPrice, Number(q.get("priceMin"))));
    const limit = Math.min(Number(q.get("limit") ?? 50), 200);
    const offset = Number(q.get("offset") ?? 0);
    const rows = await db.select().from(schema.listings)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.listings.lastSeenAt)).limit(limit).offset(offset);
    return json({ rows, limit, offset });
  }
  return null;
}
