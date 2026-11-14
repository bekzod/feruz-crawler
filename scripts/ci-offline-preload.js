// CI-only: all HTTP integrations must use injected fakes, not live providers.
// PostgreSQL uses its own TCP client and the job's disposable localhost service.
globalThis.fetch = async () => {
  throw new Error('Live HTTP is disabled in CI; inject a fake fetch implementation');
};
