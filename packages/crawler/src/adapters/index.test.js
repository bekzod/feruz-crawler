import { expect, test } from "bun:test";
import { getAdapter, getAdapterForUrl, adapters } from "./index.js";

test("getAdapter by site name", () => {
  expect(getAdapter("goonet").site).toBe("goonet");
  expect(getAdapter("carsensor").site).toBe("carsensor");
});

test("getAdapter throws on unknown site", () => {
  expect(() => getAdapter("nope")).toThrow();
});

test("getAdapterForUrl picks the right adapter", () => {
  expect(getAdapterForUrl("https://www.carsensor.net/usedcar/detail/AB/index.html").site).toBe("carsensor");
  expect(getAdapterForUrl("https://www.goo-net.com/usedcar/spread/goo/13/1.html").site).toBe("goonet");
  expect(getAdapterForUrl("https://example.com")).toBeNull();
});
