import { expect, test } from "bun:test";
import { makersRoutes } from "./makers.js";

function makeDb(rows = []) {
  return {
    select() {
      return {
        from() {
          return Promise.resolve(rows);
        }
      };
    }
  };
}

test("GET /makers returns distinct English maker labels from the database", async () => {
  const response = await makersRoutes(
    makeDb([
      { maker: "トヨタ" },
      { maker: "toyota" },
      { maker: "honda" },
      { maker: "ポルシェ" },
      { maker: "メルセデス・AMG" },
      { maker: "米国トヨタ" },
      { maker: "三菱ふそう" },
      { maker: null },
    ]),
    new Request("http://localhost/makers"),
    new URL("http://localhost/makers"),
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

test("GET /makers normalizes crawler labels when the database has no makers", async () => {
  const response = await makersRoutes(
    makeDb([]),
    new Request("http://localhost/makers"),
    new URL("http://localhost/makers"),
    {
      fetchMakerOptionsImpl: async () => [
        { value: "", label: "all makers", sites: {} },
        { value: "toyota", label: "トヨタ", sites: { carsensor: "TO" } },
      ],
    },
  );

  expect(await response.json()).toEqual({
    rows: [
      { value: "", label: "all makers", sites: {} },
      { value: "toyota", label: "Toyota", sites: { carsensor: "TO" } },
    ],
  });
});
