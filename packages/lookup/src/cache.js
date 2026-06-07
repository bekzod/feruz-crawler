import { and, eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";

export function createDbCache(db) {
  return {
    async get(field, sourceText) {
      const [row] = await db.select().from(schema.translationCache)
        .where(and(eq(schema.translationCache.field, field), eq(schema.translationCache.sourceText, sourceText)))
        .limit(1);
      return row?.english ?? null;
    },
    async set(field, sourceText, english) {
      await db.insert(schema.translationCache)
        .values({ field, sourceText, english })
        .onConflictDoNothing();
    }
  };
}
