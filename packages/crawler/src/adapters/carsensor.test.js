import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { carsensor } from "./carsensor.js";
import { parseHtml } from "../dom.js";

const memDeps = { cache: { get: async () => null, set: async () => {} }, openai: null };
const parse = (f) => parseHtml(readFileSync(join(import.meta.dir, "../../test/fixtures", f), "utf8"));

test("detectFromUrl recognizes carsensor", () => {
  expect(carsensor.detectFromUrl("https://www.carsensor.net/usedcar/detail/AU7049530165/index.html")).toBe(true);
  expect(carsensor.detectFromUrl("https://www.goo-net.com/usedcar/spread/goo/13/1.html")).toBe(false);
});

test("buildSearchUrl contains carsensor", () => {
  const url = carsensor.buildSearchUrl({ maker: "toyota", priceMax: 2000000 });
  expect(url).toContain("carsensor.net");
});

test("parseListingPage extracts real canonical fields", async () => {
  const doc = parse("carsensor-listing.html");
  const listing = await carsensor.parseListingPage(doc, "https://www.carsensor.net/usedcar/detail/AU7049530165/index.html", memDeps);
  expect(listing.source).toBe("carsensor");
  expect(listing.sourceListingId).toBe("AU7049530165");
  // Maker: トヨタ → toyota (resolved via dictionary, from h1.title1)
  expect(listing.maker).toBe("toyota");
  // Model: ヤリス → passthrough Japanese in tests (openai is null)
  expect(listing.model).toBeTruthy();
  // Total price: .totalPrice__price text = "120万円" => 1,200,000
  expect(listing.totalPrice).toBe(1200000);
  // Model year: from table "年式(初度登録年)" => "2021(R03)" => parseYear => 2021
  expect(listing.modelYear).toBe(2021);
  // Mileage: from table "走行距離" => "3.6万km" => parseMileageKm => 36000
  expect(listing.mileageKm).toBe(36000);
  // Repair history: "修復歴" => "なし" => false
  expect(listing.repairHistory).toBe(false);
  // Photos: should include the main ccsrpcma.carsensor.net photo
  expect(Array.isArray(listing.photos)).toBe(true);
  expect(listing.photos.length).toBeGreaterThan(0);
  // Description: shopComment text
  expect(listing.descriptionOriginal == null || typeof listing.descriptionOriginal === "string").toBe(true);
  // raw specMap must be present
  expect(listing.raw).toBeDefined();
  expect(typeof listing.raw.specMap).toBe("object");
});

test("parseSearchPage returns listing refs", () => {
  const doc = parse("carsensor-search.html");
  const { listingRefs, nextPageUrl } = carsensor.parseSearchPage(doc);
  expect(Array.isArray(listingRefs)).toBe(true);
  expect(listingRefs.length).toBeGreaterThan(0);
  expect(listingRefs[0].url).toContain("carsensor.net");
  // Fixture has <link rel="next"> pointing to /usedcar/index2.html
  expect(nextPageUrl).toContain("carsensor.net");
  expect(nextPageUrl).toContain("index2");
});
