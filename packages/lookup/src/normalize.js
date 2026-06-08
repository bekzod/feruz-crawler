const HALF = (s) => s.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xFF10));

export function parseYen(text) {
  if (!text) return null;
  const t = HALF(String(text)).replace(/,/g, "");
  const man = t.match(/([\d.]+)\s*万/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const yen = t.match(/([\d.]+)\s*円/);
  if (yen) return Math.round(parseFloat(yen[1]));
  const bare = t.match(/^[\d.]+$/) ? parseFloat(t) : null;
  return bare;
}

export function parseMileageKm(text) {
  if (!text) return null;
  const t = HALF(String(text)).replace(/,/g, "");
  const man = t.match(/([\d.]+)\s*万\s*km/i);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const km = t.match(/([\d.]+)\s*km/i);
  if (km) return Math.round(parseFloat(km[1]));
  return null;
}

export function parseInt0(text) {
  if (text == null) return null;
  const m = HALF(String(text)).replace(/,/g, "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

const ERA = { 令和: 2018, 平成: 1988, 昭和: 1925 };
export function parseYear(text) {
  if (!text) return null;
  const t = HALF(String(text));
  for (const [era, base] of Object.entries(ERA)) {
    const m = t.match(new RegExp(`${era}\\s*(\\d+)`));
    if (m) return base + parseInt(m[1], 10);
  }
  const w = t.match(/(19|20)\d{2}/);
  return w ? parseInt(w[0], 10) : null;
}
