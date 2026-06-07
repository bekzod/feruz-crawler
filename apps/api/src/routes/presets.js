import { eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { criteriaSchema, JOB_DISCOVER_PRESET } from "@feruz-crawler/shared";
import { syncSchedules } from "@feruz-crawler/worker/src/scheduler.js";
import { discoveryQueue } from "../queues.js";
import { json, body } from "../json.js";

export async function presetsRoutes(db, request, url) {
  const m = url.pathname.match(/^\/presets(?:\/([\w-]+))?(?:\/(run))?$/);
  if (!m) return null;
  const id = m[1], action = m[2];

  if (request.method === "GET" && !id) {
    return json(await db.select().from(schema.filterPresets));
  }
  if (request.method === "POST" && !id) {
    const b = await body(request);
    const criteria = criteriaSchema.parse(b.criteria ?? {});
    const [row] = await db.insert(schema.filterPresets).values({
      name: b.name, enabled: b.enabled ?? true, sites: b.sites ?? ["goonet", "carsensor"],
      criteria, telegramChatId: b.telegramChatId ?? null
    }).returning();
    await syncSchedules(db);
    return json(row, 201);
  }
  if (request.method === "PATCH" && id) {
    const b = await body(request);
    const patch = {};
    for (const k of ["name", "enabled", "sites", "telegramChatId"]) if (k in b) patch[k] = b[k];
    if (b.criteria) patch.criteria = criteriaSchema.parse(b.criteria);
    const [row] = await db.update(schema.filterPresets).set(patch).where(eq(schema.filterPresets.id, id)).returning();
    if (!row) return json({ error: "not found" }, 404);
    await syncSchedules(db);
    return json(row);
  }
  if (request.method === "DELETE" && id) {
    const deleted = await db.delete(schema.filterPresets).where(eq(schema.filterPresets.id, id)).returning();
    if (deleted.length === 0) return json({ error: "not found" }, 404);
    await syncSchedules(db);
    return json({ ok: true });
  }
  if (request.method === "POST" && id && action === "run") {
    const [preset] = await db.select().from(schema.filterPresets).where(eq(schema.filterPresets.id, id));
    if (!preset) return json({ error: "not found" }, 404);
    await discoveryQueue.add(JOB_DISCOVER_PRESET, { presetId: preset.id, sites: preset.sites, criteria: preset.criteria });
    return json({ ok: true });
  }
  return null;
}
