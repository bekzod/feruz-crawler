import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb,
  bigint, primaryKey, index, uniqueIndex
} from "drizzle-orm/pg-core";

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  sourceListingId: text("source_listing_id").notNull(),
  url: text("url").notNull(),
  maker: text("maker"),
  model: text("model"),
  grade: text("grade"),
  modelYear: integer("model_year"),
  mileageKm: integer("mileage_km"),
  displacementCc: integer("displacement_cc"),
  transmission: text("transmission"),
  fuelType: text("fuel_type"),
  bodyType: text("body_type"),
  drivetrain: text("drivetrain"),
  color: text("color"),
  doors: integer("doors"),
  seats: integer("seats"),
  inspectionUntil: text("inspection_until"),
  repairHistory: boolean("repair_history"),
  totalPrice: bigint("total_price", { mode: "number" }),
  vehiclePrice: bigint("vehicle_price", { mode: "number" }),
  prefecture: text("prefecture"),
  dealerName: text("dealer_name"),
  photos: jsonb("photos").default([]),
  descriptionOriginal: text("description_original"),
  raw: jsonb("raw"),
  status: text("status").notNull().default("active"),
  consecutiveMisses: integer("consecutive_misses").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  bySource: uniqueIndex("listings_source_id_uq").on(t.source, t.sourceListingId)
}));

export const makers = pgTable("makers", {
  value: text("value").primaryKey(),
  label: text("label").notNull(),
  sites: jsonb("sites").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const priceHistory = pgTable("price_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  price: bigint("price", { mode: "number" }).notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({ byListing: index("price_history_listing_idx").on(t.listingId) }));

export const filterPresets = pgTable("filter_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sites: jsonb("sites").notNull().default(["goonet", "carsensor"]),
  criteria: jsonb("criteria").notNull().default({}),
  telegramChatId: text("telegram_chat_id"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const crawlRuns = pgTable("crawl_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  presetId: uuid("preset_id").references(() => filterPresets.id, { onDelete: "set null" }),
  site: text("site").notNull(),
  status: text("status").notNull().default("running"),
  foundCount: integer("found_count").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true })
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  presetId: uuid("preset_id").references(() => filterPresets.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true })
});

export const translationCache = pgTable("translation_cache", {
  field: text("field").notNull(),
  sourceText: text("source_text").notNull(),
  english: text("english").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({ pk: primaryKey({ columns: [t.field, t.sourceText] }) }));
