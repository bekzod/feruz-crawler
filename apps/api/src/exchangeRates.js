const DEFAULT_PROVIDER_URL = "https://api.frankfurter.dev/v1/latest?base=JPY&symbols=USD,EUR";
const DEFAULT_TTL_MS = Number(process.env.EXCHANGE_RATE_TTL_MS ?? 21_600_000);
const DEFAULT_TIMEOUT_MS = Number(process.env.EXCHANGE_RATE_TIMEOUT_MS ?? 2_000);
const SOURCE = "frankfurter";
const BASE = "JPY";

function isoNow(now) {
  return new Date(now()).toISOString();
}

function unavailable(now) {
  return {
    status: "unavailable",
    base: BASE,
    rates: {},
    date: null,
    fetchedAt: isoNow(now),
    source: SOURCE
  };
}

function normalizeProviderResponse(data, now) {
  const usd = Number(data?.rates?.USD);
  const eur = Number(data?.rates?.EUR);
  if (data?.base !== BASE || !Number.isFinite(usd) || !Number.isFinite(eur)) {
    throw new Error("Invalid exchange-rate provider response");
  }

  return {
    status: "available",
    base: BASE,
    rates: { USD: usd, EUR: eur },
    date: data.date ?? null,
    fetchedAt: isoNow(now),
    source: SOURCE
  };
}

export function createExchangeRateService({
  fetchImpl = fetch,
  now = Date.now,
  ttlMs = DEFAULT_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  providerUrl = DEFAULT_PROVIDER_URL
} = {}) {
  let cache = null;
  let cachedAt = 0;

  return {
    async getLatest() {
      const currentTime = now();
      if (cache && currentTime - cachedAt < ttlMs) return cache;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(providerUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`Exchange-rate provider returned ${response.status}`);

        const result = normalizeProviderResponse(await response.json(), now);
        cache = result;
        cachedAt = currentTime;
        return result;
      } catch {
        return unavailable(now);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export function addConvertedPrices(listing, exchangeRates) {
  const convert = (amount) => {
    const result = { JPY: amount ?? null };
    if (exchangeRates?.status !== "available") return result;

    for (const [currency, rate] of Object.entries(exchangeRates.rates ?? {})) {
      result[currency] = amount == null ? null : Math.round((amount * rate + Number.EPSILON) * 100) / 100;
    }
    return result;
  };

  return {
    totalPrice: convert(listing.totalPrice),
    vehiclePrice: convert(listing.vehiclePrice)
  };
}

export const exchangeRateService = createExchangeRateService();
