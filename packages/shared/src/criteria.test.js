import { expect, test } from "bun:test";
import { criteriaSchema, matchesCriteria } from "./criteria.js";

test("criteriaSchema accepts a full criteria object", () => {
  const parsed = criteriaSchema.parse({
    maker: "toyota", models: ["prius"],
    priceMin: 500000, priceMax: 2000000,
    yearMin: 2015, yearMax: 2022,
    mileageMax: 80000,
    bodyTypes: ["suv"], fuelTypes: ["hybrid"], transmissions: ["cvt"],
    prefectures: ["tokyo"]
  });
  expect(parsed.maker).toBe("toyota");
});

test("criteriaSchema rejects unknown enum", () => {
  expect(() => criteriaSchema.parse({ maker: 1 })).toThrow();
});

test("matchesCriteria respects ranges and arrays", () => {
  const listing = {
    maker: "toyota", model: "prius", model_year: 2018,
    total_price: 1500000, mileage_km: 50000,
    body_type: "suv", fuel_type: "hybrid", transmission: "cvt", prefecture: "tokyo"
  };
  expect(matchesCriteria(listing, { maker: "toyota", priceMax: 2000000 })).toBe(true);
  expect(matchesCriteria(listing, { priceMax: 1000000 })).toBe(false);
  expect(matchesCriteria(listing, { models: ["aqua"] })).toBe(false);
  expect(matchesCriteria(listing, { yearMin: 2015, yearMax: 2022 })).toBe(true);
  expect(matchesCriteria(listing, {})).toBe(true);
});
