/**
 * Monster Fight game API smoke — verifies /api/game/* routes are registered.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getRequest } from './helpers/testServer';

describe('Monster Fight API smoke', () => {
  it('GET /api/game/config returns 200 with config', async () => {
    const request = await getRequest();
    const res = await request.get('/api/game/config');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body);
  });
});
