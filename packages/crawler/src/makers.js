import { dictionaries } from "@feruz-crawler/lookup";
import { adapters } from "./adapters/index.js";
import { parseHtml } from "./dom.js";

function normalizeDisplayText(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalMakerValue(label) {
  const normalized = normalizeDisplayText(label);
  return dictionaries.maker[label] ?? dictionaries.maker[normalized] ?? normalized.toLowerCase();
}

async function responseText(res, fallbackCharset = "utf-8") {
  const contentType = res.headers.get("content-type") ?? "";
  const charset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim() || fallbackCharset;
  return new TextDecoder(charset).decode(await res.arrayBuffer());
}

export function mergeMakerOptions(siteMakers) {
  const byValue = new Map();

  for (const maker of siteMakers) {
    if (!maker?.label) continue;
    const value = canonicalMakerValue(maker.label);
    const existing = byValue.get(value) ?? {
      value,
      label: normalizeDisplayText(maker.label),
      sites: {},
    };
    if (maker.site && maker.code) existing.sites[maker.site] = maker.code;
    byValue.set(value, existing);
  }

  return [
    { value: "", label: "all makers", sites: {} },
    ...Array.from(byValue.values()).sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

export async function fetchMakerOptions({ fetchImpl = fetch, sites = Object.keys(adapters) } = {}) {
  const results = await Promise.allSettled(
    sites.map(async (site) => {
      const adapter = adapters[site];
      if (!adapter?.makerListUrl || !adapter?.parseMakerOptions) return [];
      const res = await fetchImpl(adapter.makerListUrl);
      if (!res.ok) throw new Error(`${site} maker list returned ${res.status}`);
      const doc = parseHtml(await responseText(res, adapter.makerListCharset));
      return adapter.parseMakerOptions(doc);
    }),
  );

  return mergeMakerOptions(results.flatMap((result) => result.status === "fulfilled" ? result.value : []));
}
