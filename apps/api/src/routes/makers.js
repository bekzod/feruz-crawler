import { fetchMakerOptions } from "@feruz-crawler/crawler/makers";
import { json } from "../json.js";

export async function makersRoutes(_db, request, url) {
  if (request.method === "GET" && url.pathname === "/makers") {
    return json({ rows: await fetchMakerOptions() });
  }
  return null;
}
