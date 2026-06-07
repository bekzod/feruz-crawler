import * as dicts from "./dictionaries/index.js";

const DICT_FOR = {
  maker: dicts.maker, color: dicts.color, transmission: dicts.transmission,
  fuelType: dicts.fuel, bodyType: dicts.body, drivetrain: dicts.drivetrain,
  prefecture: dicts.prefecture
};

export async function translateField(field, value, { cache, openai }) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();

  const dict = DICT_FOR[field];
  if (dict && dict[text]) return dict[text];

  const cached = await cache.get(field, text);
  if (cached) return cached;

  if (openai) {
    try {
      const english = await openai.translate(field, text);
      if (english) {
        await cache.set(field, text, english);
        return english;
      }
    } catch (err) {
      // OpenAI unavailable / invalid key — fall back to original text
      console.warn(`[lookup] translateField(${field}) OpenAI error: ${err?.message ?? err}`);
    }
  }
  return text;
}
