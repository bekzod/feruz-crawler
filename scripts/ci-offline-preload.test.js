import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('CI preload refuses live HTTP before any network request', () => {
  const result = spawnSync(process.execPath, [
    '--preload', './scripts/ci-offline-preload.js', '-e',
    `try { await fetch('https://example.invalid'); process.exit(1); }
     catch (error) { process.exit(error.message.includes('Live HTTP is disabled in CI') ? 0 : 2); }`,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  expect(result.status).toBe(0);
});
