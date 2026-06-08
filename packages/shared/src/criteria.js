import { z } from "zod";

export const criteriaSchema = z.object({
  maker: z.string().optional(),
  models: z.array(z.string()).optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  yearMin: z.number().int().optional(),
  yearMax: z.number().int().optional(),
  mileageMin: z.number().int().nonnegative().optional(),
  mileageMax: z.number().int().nonnegative().optional(),
  bodyTypes: z.array(z.string()).optional(),
  fuelTypes: z.array(z.string()).optional(),
  transmissions: z.array(z.string()).optional(),
  prefectures: z.array(z.string()).optional()
}).strict();

function inRange(value, min, max) {
  if (value == null) return min == null && max == null ? true : false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function inSet(value, set) {
  if (!set || set.length === 0) return true;
  return value != null && set.includes(value);
}

export function matchesCriteria(listing, criteria) {
  if (criteria.maker && listing.maker !== criteria.maker) return false;
  if (!inSet(listing.model, criteria.models)) return false;
  if (!inRange(listing.total_price, criteria.priceMin, criteria.priceMax)) return false;
  if (!inRange(listing.model_year, criteria.yearMin, criteria.yearMax)) return false;
  if (!inRange(listing.mileage_km, criteria.mileageMin, criteria.mileageMax)) return false;
  if (!inSet(listing.body_type, criteria.bodyTypes)) return false;
  if (!inSet(listing.fuel_type, criteria.fuelTypes)) return false;
  if (!inSet(listing.transmission, criteria.transmissions)) return false;
  if (!inSet(listing.prefecture, criteria.prefectures)) return false;
  return true;
}
