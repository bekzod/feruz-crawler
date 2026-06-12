import { expect, test } from "bun:test";
import {
  addConvertedPrices,
  createExchangeRateService
} from "./exchangeRates.js";

test("exchange rate service normalizes provider response", async () => {
  const service = createExchangeRateService({
    now: () => 1_700_000_000_000,
    fetchImpl: async (url) => {
      expect(String(url)).toBe("https://api.frankfurter.dev/v1/latest?base=JPY&symbols=USD,EUR");
      return new Response(JSON.stringify({
        base: "JPY",
        date: "2026-06-12",
        rates: { USD: 0.00623, EUR: 0.0054 }
      }));
    }
  });

  expect(await service.getLatest()).toEqual({
    status: "available",
    base: "JPY",
    rates: { USD: 0.00623, EUR: 0.0054 },
    date: "2026-06-12",
    fetchedAt: "2023-11-14T22:13:20.000Z",
    source: "frankfurter"
  });
});

test("exchange rate service reuses cached successful rates within ttl", async () => {
  let calls = 0;
  const service = createExchangeRateService({
    now: () => 1_700_000_000_000,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        base: "JPY",
        date: "2026-06-12",
        rates: { USD: 0.00623, EUR: 0.0054 }
      }));
    }
  });

  await service.getLatest();
  await service.getLatest();

  expect(calls).toBe(1);
});

test("exchange rate service returns unavailable when provider fails", async () => {
  const service = createExchangeRateService({
    now: () => 1_700_000_000_000,
    fetchImpl: async () => new Response("nope", { status: 502 })
  });

  expect(await service.getLatest()).toEqual({
    status: "unavailable",
    base: "JPY",
    rates: {},
    date: null,
    fetchedAt: "2023-11-14T22:13:20.000Z",
    source: "frankfurter"
  });
});

test("exchange rate service aborts slow provider calls", async () => {
  const service = createExchangeRateService({
    timeoutMs: 5,
    now: () => 1_700_000_000_000,
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
      setTimeout(() => resolve(new Response("{}")), 50);
    })
  });

  expect(await service.getLatest()).toMatchObject({ status: "unavailable" });
});

test("addConvertedPrices rounds converted values and preserves null prices", () => {
  const listing = {
    totalPrice: 1_200_000,
    vehiclePrice: null
  };

  expect(addConvertedPrices(listing, {
    status: "available",
    rates: { USD: 0.00623, EUR: 0.0054 }
  })).toEqual({
    totalPrice: { JPY: 1_200_000, USD: 7476, EUR: 6480 },
    vehiclePrice: { JPY: null, USD: null, EUR: null }
  });
});
