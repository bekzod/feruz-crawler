import { translateField, normalize, specLabels } from "@feruz-crawler/lookup";

const NUMERIC = {
  modelYear: normalize.parseYear, mileageKm: normalize.parseMileageKm,
  displacementCc: normalize.parseInt0, doors: normalize.parseInt0, seats: normalize.parseInt0,
  totalPrice: normalize.parseYen, vehiclePrice: normalize.parseYen
};
const TRANSLATED = ["maker", "model", "grade", "color", "transmission", "fuelType", "bodyType", "drivetrain", "prefecture"];

function parseRepairHistory(value) {
  if (value == null) return null;
  return !/なし|無/.test(String(value)); // "なし"/"無" => no repair history => false
}

export async function specMapToCanonical(specMap, deps) {
  const out = {};
  for (const [label, rawValue] of Object.entries(specMap)) {
    const field = specLabels[label.trim()];
    if (!field) continue;
    if (out[field] != null) continue; // first match wins (e.g. multiple price labels)
    if (NUMERIC[field]) out[field] = NUMERIC[field](rawValue);
    else if (field === "repairHistory") out[field] = parseRepairHistory(rawValue);
    else if (TRANSLATED.includes(field)) out[field] = await translateField(field, rawValue, deps);
    else if (field === "inspectionUntil") out[field] = String(rawValue).trim();
  }
  return out;
}

// Reads a definition-list / table of specs into { label: value }. Site-specific
// container selectors are pinned in the adapters (Tasks 7-8); this default handles
// th/td table rows and dl dt/dd pairs.
export function readSpecTable(doc) {
  const map = {};
  for (const row of doc.querySelectorAll("table.spec tr, .spec-table tr")) {
    const k = row.querySelector("th")?.textContent?.trim();
    const v = row.querySelector("td")?.textContent?.trim();
    if (k && v) map[k] = v;
  }
  for (const dt of doc.querySelectorAll("dl.spec dt")) {
    const k = dt.textContent?.trim();
    const v = dt.nextElementSibling?.textContent?.trim();
    if (k && v) map[k] = v;
  }
  return map;
}

export function dedupeById(refs) {
  const seen = new Set();
  return refs.filter((r) => (seen.has(r.sourceListingId) ? false : seen.add(r.sourceListingId)));
}
