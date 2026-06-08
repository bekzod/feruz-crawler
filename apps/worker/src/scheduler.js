import { eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { JOB_DISCOVER_PRESET } from "@feruz-crawler/shared";
import { discoveryQueue, defaultJobOpts } from "./queues.js";

const repeatKey = (presetId) => `preset:${presetId}`;

// Sync BullMQ repeatable jobs with enabled presets. Call on startup and after preset writes.
export async function syncSchedules(db) {
  const presets = await db.select().from(schema.filterPresets);
  const existing = await discoveryQueue.getRepeatableJobs();

  // Remove repeatable jobs whose preset is gone or disabled.
  for (const job of existing) {
    if (job.name !== JOB_DISCOVER_PRESET) continue;
    const stillWanted = presets.find((p) => repeatKey(p.id) === job.id && p.enabled);
    if (!stillWanted) await discoveryQueue.removeRepeatableByKey(job.key);
  }

  // Ensure an hourly repeatable job exists for each enabled preset.
  for (const preset of presets) {
    if (!preset.enabled) continue;
    await discoveryQueue.add(
      JOB_DISCOVER_PRESET,
      { presetId: preset.id, sites: preset.sites, criteria: preset.criteria },
      { repeat: { every: 60 * 60 * 1000 }, jobId: repeatKey(preset.id) }
    );
  }
}

// The repeatable JOB_DISCOVER_PRESET fans out one per-site discovery job per (preset x site).
export async function fanOutPreset(db, job) {
  const { presetId, sites, criteria } = job.data;
  for (const site of sites ?? []) {
    await discoveryQueue.add("discover-site", { presetId, site, criteria }, defaultJobOpts);
  }
}
