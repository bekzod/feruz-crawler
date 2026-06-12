import { fetchMakerOptions } from "@feruz-crawler/crawler/makers";
import { schema } from "@feruz-crawler/db";
import { dictionaries } from "@feruz-crawler/lookup";
import { sql } from "drizzle-orm";
import { json } from "../json.js";

function normalizeDisplayText(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalMakerValue(value) {
  if (value == null) return "";
  const normalized = normalizeDisplayText(value);
  return dictionaries.maker[value] ?? dictionaries.maker[normalized] ?? normalized.toLowerCase();
}

function makerLabel(value) {
  if (!value) return "all makers";
  return String(value)
    .split("-")
    .map((word) => word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join("-");
}

function normalizeMakerOption(option) {
  const value = canonicalMakerValue(option?.value ?? option?.maker ?? option?.label);
  return {
    value,
    label: makerLabel(value),
    sites: option?.sites ?? {},
  };
}

function uniqueSortedOptions(options) {
  const byValue = new Map();
  for (const option of options) {
    if (!option.value && option.label !== "all makers") continue;
    byValue.set(option.value, option);
  }
  return Array.from(byValue.values()).sort((a, b) => {
    if (!a.value) return -1;
    if (!b.value) return 1;
    return a.label.localeCompare(b.label);
  });
}

async function fetchPersistedMakerOptions(db) {
  const rows = await db
    .select({
      value: schema.makers.value,
      label: schema.makers.label,
      sites: schema.makers.sites,
    })
    .from(schema.makers);

  return uniqueSortedOptions([
    { value: "", label: "all makers", sites: {} },
    ...rows.map((row) => normalizeMakerOption(row)),
  ]);
}

async function fetchListingMakerOptions(db) {
  const rows = await db.select({ maker: schema.listings.maker }).from(schema.listings);
  return uniqueSortedOptions([
    { value: "", label: "all makers", sites: {} },
    ...rows
      .map((row) => normalizeMakerOption(row))
      .filter((option) => option.value),
  ]);
}

async function upsertMakerOptions(db, options) {
  const rows = options
    .filter((option) => option.value)
    .map((option) => ({
      value: option.value,
      label: option.label,
      sites: option.sites ?? {},
    }));

  if (!rows.length) return;

  await db
    .insert(schema.makers)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.makers.value,
      set: {
        label: sql`excluded.label`,
        sites: sql`excluded.sites`,
        updatedAt: new Date(),
      },
    });
}

export async function makersRoutes(db, request, url, { fetchMakerOptionsImpl = fetchMakerOptions } = {}) {
  if (request.method === "GET" && url.pathname === "/makers") {
    const persistedOptions = await fetchPersistedMakerOptions(db);
    if (persistedOptions.length > 1) return json({ rows: persistedOptions });

    const crawlerOptions = (await fetchMakerOptionsImpl()).map(normalizeMakerOption);
    const normalizedCrawlerOptions = uniqueSortedOptions(crawlerOptions);
    if (normalizedCrawlerOptions.length > 1) {
      await upsertMakerOptions(db, normalizedCrawlerOptions);
      return json({ rows: normalizedCrawlerOptions });
    }

    return json({ rows: await fetchListingMakerOptions(db) });
  }
  return null;
}
