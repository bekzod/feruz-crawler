import { expect, test } from "bun:test";
import { parseYen, parseMileageKm, parseInt0, parseYear } from "./normalize.js";

test("parseYen handles 万円 and commas", () => {
  expect(parseYen("150.5万円")).toBe(1505000);
  expect(parseYen("1,500,000円")).toBe(1500000);
  expect(parseYen("応談")).toBeNull();
});

test("parseMileageKm handles 万km and km", () => {
  expect(parseMileageKm("5.2万km")).toBe(52000);
  expect(parseMileageKm("80,000km")).toBe(80000);
});

test("parseYear handles Japanese era and western", () => {
  expect(parseYear("2018年")).toBe(2018);
  expect(parseYear("平成30年")).toBe(2018);
});
