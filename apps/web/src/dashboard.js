function queueCount(queue, key) {
  return Number(queue?.[key] ?? 0);
}

export function summarizeJobs(jobs = {}) {
  jobs = jobs ?? {};
  const queueNames = ["discovery", "listing"];
  const totals = queueNames.reduce((acc, name) => {
    const queue = jobs[name] ?? {};
    acc.active += queueCount(queue, "active");
    acc.waiting += queueCount(queue, "waiting");
    acc.delayed += queueCount(queue, "delayed");
    acc.completed += queueCount(queue, "completed");
    acc.failed += Array.isArray(jobs[`${name}_failed`])
      ? jobs[`${name}_failed`].length
      : queueCount(queue, "failed");
    return acc;
  }, { active: 0, waiting: 0, delayed: 0, completed: 0, failed: 0 });

  return { ...totals, hasFailures: totals.failed > 0 };
}

export function summarizePresets(presets = []) {
  const enabled = presets.filter((preset) => preset.enabled).length;
  return {
    total: presets.length,
    enabled,
    paused: presets.length - enabled,
  };
}

export function countUnreadNotifications(items = []) {
  return items.filter((item) => !item?.n?.readAt).length;
}

export function summarizeListings(rows = []) {
  const active = rows.filter((row) => row.status === "active").length;
  const sold = rows.filter((row) => row.status === "sold_removed").length;
  return {
    total: rows.length,
    active,
    sold,
  };
}

export function flattenFailedJobs(jobs = {}) {
  jobs = jobs ?? {};
  return ["discovery", "listing"].flatMap((queue) => (
    Array.isArray(jobs[`${queue}_failed`])
      ? jobs[`${queue}_failed`].map((job) => ({ ...job, queue }))
      : []
  ));
}
