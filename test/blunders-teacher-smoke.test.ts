/**
 * Blunders teacher API smoke — routes registered (auth required).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getRequest, registerTestOrg } from './helpers/testServer';

describe('Blunders teacher API smoke', () => {
  it('GET /api/teachers/blunders/settings without token returns 401', async () => {
    const request = await getRequest();
    const res = await request.get('/api/teachers/blunders/settings');
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/teachers/blunders/settings with org token is not 404', async () => {
    const request = await getRequest();
    const { token } = await registerTestOrg(request);
    const res = await request
      .get('/api/teachers/blunders/settings')
      .set('Authorization', `Bearer ${token}`);
    assert.notStrictEqual(res.status, 404, 'route should be registered');
    assert.ok([200, 403].includes(res.status), `expected 200 or 403, got ${res.status}`);
  });
});
