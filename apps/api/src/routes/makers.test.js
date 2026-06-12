import { expect, test } from "bun:test";
import { makersRoutes } from "./makers.js";
import * as schema from "../../../../packages/db/src/schema.js";

function makeDb({ makers = [], listings = [] } = {}) {
  const inserted = [];
  return {
    inserted,
    select() {
      return {
        from(table) {
          if (table === schema.makers) return Promise.resolve(makers);
          if (table === schema.listings) return Promise.resolve(listings);
          return Promise.resolve([]);
        }
      };
    },
    insert(table) {
      expect(table).toBe(schema.makers);
      return {
        values(rows) {
          inserted.push(...rows);
          return {
            onConflictDoUpdate() {
              return Promise.resolve();
            }
          };
        }
      };
    },
  };
}

test("GET /makers returns persisted maker table rows before crawling", async () => {
  let crawled = false;
  const response = await makersRoutes(
    makeDb({
      makers: [
        { value: "トヨタ", label: "トヨタ", sites: { goonet: "TOYOTA" } },
        { value: "honda", label: "Honda", sites: { carsensor: "HO" } },
      ],
    }),
    new Request("http://localhost/makers"),
    new URL("http://localhost/makers"),
    { fetchMakerOptionsImpl: async () => { crawled = true; return []; } },
  );

  expect(await response.json()).toEqual({
    rows: [
      { value: "", label: "all makers", sites: {} },
      { value: "honda", label: "Honda", sites: { carsensor: "HO" } },
      { value: "toyota", label: "Toyota", sites: { goonet: "TOYOTA" } },
    ],
  });
  expect(crawled).toBe(false);
});

test("GET /makers fills maker table from crawler websites when it is empty", async () => {
  const db = makeDb();
  const response = await makersRoutes(
    db,
    new Request("http://localhost/makers"),
    new URL("http://localhost/makers"),
    {
      fetchMakerOptionsImpl: async () => [
        { value: "", label: "all makers", sites: {} },
        { value: "toyota", label: "トヨタ", sites: { carsensor: "TO", goonet: "TOYOTA" } },
      ],
    },
  );

  expect(await response.json()).toEqual({
    rows: [
      { value: "", label: "all makers", sites: {} },
      { value: "toyota", label: "Toyota", sites: { carsensor: "TO", goonet: "TOYOTA" } },
    ],
  });
  expect(db.inserted).toEqual([
    { value: "toyota", label: "Toyota", sites: { carsensor: "TO", goonet: "TOYOTA" } },
  ]);
});

test("GET /makers falls back to listing makers when crawler websites are unavailable", async () => {
  const response = await makersRoutes(
    makeDb({
      listings: [
        { maker: "トヨタ" },
        { maker: "toyota" },
        { maker: "honda" },
        { maker: "ポルシェ" },
        { maker: "メルセデス・AMG" },
        { maker: "米国トヨタ" },
        { maker: "三菱ふそう" },
        { maker: null },
      ],
    }),
    new Request("http://localhost/makers"),
    new URL("http://localhost/makers"),
    { fetchMakerOptionsImpl: async () => [] },
  );

  expect(await response.json()).toEqual({
    rows: [
      { value: "", label: "all makers", sites: {} },
      { value: "honda", label: "Honda", sites: {} },
      { value: "mercedes-amg", label: "Mercedes-AMG", sites: {} },
      { value: "mitsubishi-fuso", label: "Mitsubishi-Fuso", sites: {} },
      { value: "porsche", label: "Porsche", sites: {} },
      { value: "toyota", label: "Toyota", sites: {} },
      { value: "us-toyota", label: "US-Toyota", sites: {} },
    ],
  });
});
