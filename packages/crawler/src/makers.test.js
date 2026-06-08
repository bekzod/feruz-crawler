import { expect, test } from "bun:test";
import { mergeMakerOptions } from "./makers.js";

test("mergeMakerOptions canonicalizes known maker labels and merges site codes", () => {
  const options = mergeMakerOptions([
    { site: "carsensor", code: "TO", label: "トヨタ" },
    { site: "goonet", code: "TOYOTA", label: "トヨタ" },
    { site: "carsensor", code: "HO", label: "ホンダ" },
  ]);

  expect(options[0]).toEqual({ value: "", label: "all makers", sites: {} });
  expect(options).toContainEqual({
    value: "toyota",
    label: "トヨタ",
    sites: { carsensor: "TO", goonet: "TOYOTA" },
  });
  expect(options).toContainEqual({
    value: "honda",
    label: "ホンダ",
    sites: { carsensor: "HO" },
  });
});
