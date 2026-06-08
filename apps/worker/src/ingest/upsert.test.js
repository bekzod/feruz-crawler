import { expect, test, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@feruz-crawler/db";
import { upsertListing } from "./upsert.js";

const { db, sql } = createDb();
afterAll(() => sql.end());

const base = (over = {}) => ({
  source: "goonet", sourceListingId: `u-${Date.now()}-${Math.random()}`,
  url: "http://x", maker: "toyota", totalPrice: 1000000, ...over
});

test("inserts new listing and records initial price", async () => {
  const l = base();
  const r = await upsertListing(db, l);
  expect(r.isNew).toBe(true);
  const prices = await db.select().from(schema.priceHistory).where(eq(schema.priceHistory.listingId, r.listing.id));
  expect(prices.length).toBe(1);
});

test("translates maker before inserting listing", async () => {
  let insertedListing;
  const fakeDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({
      values: (values) => {
        insertedListing = values;
        return { returning: async () => [{ id: "listing-1", ...values }] };
      },
    }),
  };

  const r = await upsertListing(fakeDb, base({ maker: "トヨタ", totalPrice: null }));

  expect(insertedListing.maker).toBe("toyota");
  expect(r.listing.maker).toBe("toyota");
});

test("translates maker before updating listing", async () => {
  let updatedListing;
  const fakeDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "listing-1", totalPrice: null }],
        }),
      }),
    }),
    update: () => ({
      set: (values) => {
        updatedListing = values;
        return {
          where: () => ({
            returning: async () => [{ id: "listing-1", ...values }],
          }),
        };
      },
    }),
  };

  const r = await upsertListing(fakeDb, base({ maker: "ホンダ", totalPrice: null }));

  expect(updatedListing.maker).toBe("honda");
  expect(r.listing.maker).toBe("honda");
});

test("updating with new price appends history; same price does not", async () => {
  const l = base();
  const r1 = await upsertListing(db, l);
  const r2 = await upsertListing(db, { ...l, totalPrice: 900000 });
  expect(r2.isNew).toBe(false);
  expect(r2.priceChanged).toBe(true);
  const r3 = await upsertListing(db, { ...l, totalPrice: 900000 });
  expect(r3.priceChanged).toBe(false);
  const prices = await db.select().from(schema.priceHistory).where(eq(schema.priceHistory.listingId, r1.listing.id));
  expect(prices.length).toBe(2);
});
