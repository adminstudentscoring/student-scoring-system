/**
 * Blunders public API smoke — verifies routes are registered (no auth).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getRequest } from './helpers/testServer';

describe('Blunders public API smoke', () => {
  it('GET /api/public/students/:id/blunders returns 404 for unknown student', async () => {
    const request = await getRequest();
    const res = await request.get('/api/public/students/nonexistent-student-id/blunders');
    assert.strictEqual(res.status, 404);
    assert.ok(res.body?.error);
  });
});
