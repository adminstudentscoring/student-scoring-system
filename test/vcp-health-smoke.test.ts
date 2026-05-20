/**
 * Smoke: VCP module wiring via server startup.
 * Run: `pnpm test:vcp`
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { getRequest, stopTestServer } from './helpers/testServer';

describe('VCP health smoke', () => {
  let request: Awaited<ReturnType<typeof getRequest>>;

  before(async () => {
    request = await getRequest();
  });

  after(() => {
    stopTestServer();
  });

  it('GET / returns 200 (server with VCP wired)', async () => {
    const res = await request.get('/');
    assert.strictEqual(res.status, 200, res.text);
  });
});
