import { goonet } from "./goonet.js";
import { carsensor } from "./carsensor.js";

export { goonet, carsensor };

export const adapters = { goonet, carsensor };

export function getAdapter(site) {
  const a = adapters[site];
  if (!a) throw new Error(`Unknown site: ${site}`);
  return a;
}

export function getAdapterForUrl(url) {
  return Object.values(adapters).find((a) => a.detectFromUrl(url)) ?? null;
}
