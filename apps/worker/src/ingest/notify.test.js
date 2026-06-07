import { expect, test, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@feruz-crawler/db";
import { notifyMatches } from "./notify.js";

const { db, sql } = createDb();
afterAll(() => sql.end());

test("creates a notification + telegram push when a new listing matches an enabled preset", async () => {
  const tag = `n-${Date.now()}-${Math.random()}`;
  const [preset] = await db.insert(schema.filterPresets).values({
    name: tag, enabled: true, sites: ["goonet"], criteria: { maker: "toyota", models: [tag] }, telegramChatId: "123"
  }).returning();
  const [listing] = await db.insert(schema.listings).values({
    source: "goonet", sourceListingId: tag, url: "http://x", maker: "toyota", model: tag, totalPrice: 1000000
  }).returning();

  const sent = [];
  await notifyMatches(db, listing, { telegram: { send: async (chatId, text) => sent.push({ chatId, text }) } });

  const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.listingId, listing.id));
  expect(notes.length).toBe(1);
  expect(notes[0].presetId).toBe(preset.id);
  expect(sent.length).toBe(1);
  expect(sent[0].chatId).toBe("123");
});

test("no notification when criteria does not match", async () => {
  const tag = `nn-${Date.now()}-${Math.random()}`;
  await db.insert(schema.filterPresets).values({
    name: tag, enabled: true, sites: ["goonet"], criteria: { maker: "honda" }
  }).returning();
  const [listing] = await db.insert(schema.listings).values({
    source: "goonet", sourceListingId: tag, url: "http://x", maker: "toyota", totalPrice: 1000000
  }).returning();

  await notifyMatches(db, listing, {});
  const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.listingId, listing.id));
  expect(notes.length).toBe(0);
});
