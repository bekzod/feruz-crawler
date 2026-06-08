import { expect, test } from "bun:test";
import { defaultMakerOptions, normalizeMakerOptionsResponse } from "./makerOptions.js";

test("normalizeMakerOptionsResponse uses API rows for dropdown choices", () => {
  const options = normalizeMakerOptionsResponse({
    rows: [
      { value: "", label: "all makers", sites: {} },
      { value: "toyota", label: "トヨタ", sites: { carsensor: "TO" } },
    ],
  });

  expect(options).toEqual([
    { value: "", label: "all makers", sites: {} },
    { value: "toyota", label: "トヨタ", sites: { carsensor: "TO" } },
  ]);
});

test("normalizeMakerOptionsResponse falls back while maker API is unavailable", () => {
  expect(normalizeMakerOptionsResponse(null)).toBe(defaultMakerOptions);
});
