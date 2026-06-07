import { expect, test } from "bun:test";
import { translateField } from "./translate.js";

const noOpenAI = { translate: async () => { throw new Error("should not be called"); } };
const memCache = () => {
  const m = new Map();
  return {
    get: async (f, s) => m.get(`${f}:${s}`) ?? null,
    set: async (f, s, e) => { m.set(`${f}:${s}`, e); }
  };
};

test("translateField uses dictionary when available", async () => {
  const out = await translateField("transmission", "オートマ", { cache: memCache(), openai: noOpenAI });
  expect(out).toBe("at");
});

test("translateField returns null for empty", async () => {
  expect(await translateField("color", "", { cache: memCache(), openai: noOpenAI })).toBeNull();
});

test("translateField falls back to original text when openai throws", async () => {
  const throwingOpenAI = { translate: async () => { throw new Error("401"); } };
  const out = await translateField("model", "ヴォクシー", { cache: memCache(), openai: throwingOpenAI });
  expect(out).toBe("ヴォクシー");
});
