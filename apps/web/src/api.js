const base = "/api";
async function req(path, opts) {
  const res = await fetch(base + path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}
export const api = {
  listings: (qs = "") => req(`/listings${qs}`),
  listing: (id) => req(`/listings/${id}`),
  makers: () => req(`/makers`),
  presets: () => req(`/presets`),
  createPreset: (p) => req(`/presets`, { method: "POST", body: JSON.stringify(p) }),
  updatePreset: (id, p) => req(`/presets/${id}`, { method: "PATCH", body: JSON.stringify(p) }),
  deletePreset: (id) => req(`/presets/${id}`, { method: "DELETE" }),
  runPreset: (id) => req(`/presets/${id}/run`, { method: "POST" }),
  crawlUrl: (url) => req(`/crawl/url`, { method: "POST", body: JSON.stringify({ url }) }),
  jobs: () => req(`/jobs`),
  notifications: () => req(`/notifications`),
  readNotification: (id) => req(`/notifications/${id}/read`, { method: "POST" })
};
