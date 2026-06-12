import { fetchMakerOptions } from "@feruz-crawler/crawler/makers";
import { schema } from "@feruz-crawler/db";
import { dictionaries } from "@feruz-crawler/lookup";
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

async function fetchDbMakerOptions(db) {
  const rows = await db.select({ maker: schema.listings.maker }).from(schema.listings);
  return uniqueSortedOptions([
    { value: "", label: "all makers", sites: {} },
    ...rows
      .map((row) => normalizeMakerOption(row))
      .filter((option) => option.value),
  ]);
}

export async function makersRoutes(db, request, url, { fetchMakerOptionsImpl = fetchMakerOptions } = {}) {
  if (request.method === "GET" && url.pathname === "/makers") {
    const dbOptions = await fetchDbMakerOptions(db);
    if (dbOptions.length > 1) return json({ rows: dbOptions });

    const crawlerOptions = (await fetchMakerOptionsImpl()).map(normalizeMakerOption);
    return json({ rows: uniqueSortedOptions(crawlerOptions) });
  }
  return null;
}
