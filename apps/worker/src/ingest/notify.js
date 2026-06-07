import { eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { matchesCriteria } from "@feruz-crawler/shared";

// Adapt a DB listing row (camelCase) to the snake_case shape matchesCriteria expects.
function toMatchShape(listing) {
  return {
    maker: listing.maker,
    model: listing.model,
    total_price: listing.totalPrice,
    model_year: listing.modelYear,
    mileage_km: listing.mileageKm,
    body_type: listing.bodyType,
    fuel_type: listing.fuelType,
    transmission: listing.transmission,
    prefecture: listing.prefecture
  };
}

// Call ONLY for newly-inserted listings. Creates in-app notifications + Telegram pushes
// for every enabled preset (matching this listing's source + criteria).
export async function notifyMatches(db, listing, { telegram } = {}) {
  const presets = await db.select().from(schema.filterPresets).where(eq(schema.filterPresets.enabled, true));
  const shaped = toMatchShape(listing);
  for (const preset of presets) {
    if (!Array.isArray(preset.sites) || !preset.sites.includes(listing.source)) continue;
    if (!matchesCriteria(shaped, preset.criteria ?? {})) continue;

    await db.insert(schema.notifications).values({ listingId: listing.id, presetId: preset.id });
    if (telegram && preset.telegramChatId) {
      const text = `New match (${preset.name}): ${listing.maker ?? ""} ${listing.model ?? ""} — ¥${listing.totalPrice ?? "?"}\n${listing.url}`;
      await telegram.send(preset.telegramChatId, text).catch(() => {});
    }
  }
}
