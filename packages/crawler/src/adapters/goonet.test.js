import { expect, test, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHtml } from "../dom.js";
import { goonet } from "./goonet.js";

// Real values extracted from fixtures:
// goonet-listing.html:
//   carId      = "965026060100561098002"  (from og:url)
//   totalPrice = 2429000  (242.9万円 * 10000)
//   modelYear  = 2018     (年式: 2018(平成30)年)
//   mileageKm  = 52000    (5.2万km)
//   color      = ブラック
//   transmission = インパネAT
// goonet-search.html:
//   nextPageUrl = "https://www.goo-net.com/usedcar/brand-TOYOTA/list/index-2.html"

const memDeps = { cache: { get: async () => null, set: async () => {} }, openai: null };

const LISTING_URL = "https://www.goo-net.com/usedcar/spread/goo/13/965026060100561098002.html";

describe("goonet.detectFromUrl", () => {
  test("true for goo-net.com detail URL", () => {
    expect(goonet.detectFromUrl(LISTING_URL)).toBe(true);
  });
  test("false for carsensor URL", () => {
    expect(goonet.detectFromUrl("https://www.carsensor.net/usedcar/detail/CU1234567/index.html")).toBe(false);
  });
});

describe("goonet.buildSearchUrl", () => {
  test("builds TOYOTA list URL", () => {
    const url = goonet.buildSearchUrl({ maker: "toyota" });
    expect(url).toContain("goo-net.com");
    expect(url).toContain("brand-TOYOTA");
  });
  test("returns a valid URL string", () => {
    const url = goonet.buildSearchUrl({ maker: "honda" });
    expect(url).toContain("brand-HONDA");
  });
});

describe("goonet.parseListingPage", () => {
  const html = readFileSync(join(import.meta.dir, "../../test/fixtures/goonet-listing.html"), "utf8");
  const doc = parseHtml(html);

  test("parses listing page fixture", async () => {
    const result = await goonet.parseListingPage(doc, LISTING_URL, memDeps);

    expect(result.source).toBe("goonet");
    expect(result.sourceListingId).toBe("965026060100561098002");
    expect(result.url).toBe(LISTING_URL);

    // Price: 支払総額 = 242.9万円 → 2429000
    expect(result.totalPrice).toBe(2429000);

    // Year: 年式 = 2018
    expect(result.modelYear).toBe(2018);

    // Mileage: 5.2万km → 52000
    expect(typeof result.mileageKm).toBe("number");
    expect(result.mileageKm).toBe(52000);

    // Maker: トヨタ → toyota (resolved via dictionary, from h1/breadcrumb title)
    expect(result.maker).toBe("toyota");

    // Model: ヴォクシー → passthrough Japanese in tests (openai is null)
    expect(result.model).toBeTruthy();

    // Color: 車体色 = ブラック → canonicalized (locks the translate pipeline)
    expect(result.color).toBeTruthy();

    // Transmission: ミッション = インパネAT → canonicalized
    expect(result.transmission).toBeTruthy();

    // Description must be truthy
    expect(result.descriptionOriginal).toBeTruthy();

    // Photos: must be a non-empty array of image URLs
    expect(Array.isArray(result.photos)).toBe(true);
    expect(result.photos.length).toBeGreaterThan(0);

    // raw specMap must be present
    expect(result.raw).toBeDefined();
    expect(result.raw.specMap).toBeDefined();
  });
});

describe("goonet.parseSearchPage", () => {
  const html = readFileSync(join(import.meta.dir, "../../test/fixtures/goonet-search.html"), "utf8");
  const doc = parseHtml(html);

  test("parses search page fixture", () => {
    const result = goonet.parseSearchPage(doc);

    expect(result).toHaveProperty("listingRefs");
    expect(result).toHaveProperty("nextPageUrl");

    // Must find at least one listing ref
    expect(Array.isArray(result.listingRefs)).toBe(true);
    expect(result.listingRefs.length).toBeGreaterThan(0);

    // Each ref must have sourceListingId and url
    const ref = result.listingRefs[0];
    expect(ref).toHaveProperty("sourceListingId");
    expect(ref).toHaveProperty("url");

    // URLs must be absolute goo-net URLs
    expect(ref.url).toContain("https://www.goo-net.com");
    expect(ref.url).toContain("/usedcar/spread/goo/");

    // sourceListingId is the car number from the URL (plausible long digit id)
    expect(ref.sourceListingId).toBeTruthy();
    expect(ref.sourceListingId).toMatch(/^\d{10,25}$/);

    // nextPageUrl from rel="next" link
    expect(result.nextPageUrl).toBe("https://www.goo-net.com/usedcar/brand-TOYOTA/list/index-2.html");
  });

  test("parseMakerOptions extracts maker links from site pages", () => {
    const makers = goonet.parseMakerOptions(doc);

    expect(makers).toContainEqual({ site: "goonet", code: "TOYOTA", label: "トヨタ" });
  });
});
