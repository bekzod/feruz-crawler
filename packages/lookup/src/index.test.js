import { expect, test } from "bun:test";
import { translateField, normalize, dictionaries, specLabels } from "./index.js";

test("public API exports are wired", () => {
  expect(typeof translateField).toBe("function");
  expect(typeof normalize.parseYen).toBe("function");
  expect(dictionaries.maker["トヨタ"]).toBe("toyota");
  expect(specLabels["年式"]).toBe("modelYear");
});
