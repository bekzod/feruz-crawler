import { desc, eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { json } from "../json.js";

export async function notificationsRoutes(db, request, url) {
  if (request.method === "GET" && url.pathname === "/notifications") {
    const rows = await db.select({
      n: schema.notifications, listing: schema.listings
    }).from(schema.notifications)
      .leftJoin(schema.listings, eq(schema.notifications.listingId, schema.listings.id))
      .orderBy(desc(schema.notifications.createdAt)).limit(100);
    return json(rows);
  }
  const read = url.pathname.match(/^\/notifications\/([\w-]+)\/read$/);
  if (request.method === "POST" && read) {
    await db.update(schema.notifications).set({ readAt: new Date() }).where(eq(schema.notifications.id, read[1]));
    return json({ ok: true });
  }
  return null;
}
