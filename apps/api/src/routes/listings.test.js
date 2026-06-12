import { expect, test } from "bun:test";
import { listingsRoutes } from "./listings.js";

const listingId = "11111111-1111-4111-8111-111111111111";

function makeDb({ listings = [], priceHistory = [] }) {
  return {
    select() {
      return {
        from(table) {
          const tableName = table?.[Symbol.for("drizzle:Name")];
          if (tableName === "price_history") {
            return {
              where() {
                return {
                  orderBy: async () => priceHistory
                };
              }
            };
          }

          const chain = {
            where() {
              return chain;
            },
            orderBy() {
              return chain;
            },
            limit() {
              return chain;
            },
            offset() {
              return Promise.resolve(listings);
            },
            then(resolve, reject) {
              return Promise.resolve(listings).then(resolve, reject);
            }
          };

          return {
            where: chain.where,
            orderBy: chain.orderBy,
            limit: chain.limit,
            offset: chain.offset,
            then: chain.then
          };
        }
      };
    }
  };
}

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json()
  };
}

const exchangeRates = {
  getLatest: async () => ({
    status: "available",
    base: "JPY",
    rates: { USD: 0.00623, EUR: 0.0054 },
    date: "2026-06-12",
    fetchedAt: "2026-06-12T00:00:00.000Z",
    source: "frankfurter"
  })
};

test("GET /listings enriches rows with converted prices and response exchange rates", async () => {
  const response = await listingsRoutes(
    makeDb({
      listings: [{
        id: listingId,
        source: "goonet",
        totalPrice: 1_200_000,
        vehiclePrice: 1_136_000
      }]
    }),
    new Request("http://localhost/listings?priceMin=1000000&priceMax=1300000"),
    new URL("http://localhost/listings?priceMin=1000000&priceMax=1300000"),
    { exchangeRates }
  );

  expect(await readJson(response)).toEqual({
    status: 200,
    body: {
      rows: [{
        id: listingId,
        source: "goonet",
        totalPrice: 1_200_000,
        vehiclePrice: 1_136_000,
        convertedPrices: {
          totalPrice: { JPY: 1_200_000, USD: 7476, EUR: 6480 },
          vehiclePrice: { JPY: 1_136_000, USD: 7077.28, EUR: 6134.4 }
        }
      }],
      limit: 50,
      offset: 0,
      exchangeRates: await exchangeRates.getLatest()
    }
  });
});

test("GET /listings falls back to JPY-only converted prices when rates are unavailable", async () => {
  const unavailableRates = {
    getLatest: async () => ({
      status: "unavailable",
      base: "JPY",
      rates: {},
      date: null,
      fetchedAt: "2026-06-12T00:00:00.000Z",
      source: "frankfurter"
    })
  };
  const response = await listingsRoutes(
    makeDb({
      listings: [{
        id: listingId,
        source: "carsensor",
        totalPrice: 900_000,
        vehiclePrice: null
      }]
    }),
    new Request("http://localhost/listings"),
    new URL("http://localhost/listings"),
    { exchangeRates: unavailableRates }
  );

  expect((await response.json()).rows[0].convertedPrices).toEqual({
    totalPrice: { JPY: 900_000 },
    vehiclePrice: { JPY: null }
  });
});

test("GET /listings/:id enriches listing but does not convert price history", async () => {
  const priceHistory = [{
    id: "22222222-2222-4222-8222-222222222222",
    listingId,
    price: 1_200_000
  }];
  const response = await listingsRoutes(
    makeDb({
      listings: [{
        id: listingId,
        source: "goonet",
        totalPrice: 1_200_000,
        vehiclePrice: 1_136_000
      }],
      priceHistory
    }),
    new Request(`http://localhost/listings/${listingId}`),
    new URL(`http://localhost/listings/${listingId}`),
    { exchangeRates }
  );

  expect(await readJson(response)).toEqual({
    status: 200,
    body: {
      id: listingId,
      source: "goonet",
      totalPrice: 1_200_000,
      vehiclePrice: 1_136_000,
      priceHistory,
      convertedPrices: {
        totalPrice: { JPY: 1_200_000, USD: 7476, EUR: 6480 },
        vehiclePrice: { JPY: 1_136_000, USD: 7077.28, EUR: 6134.4 }
      },
      exchangeRates: await exchangeRates.getLatest()
    }
  });
});
