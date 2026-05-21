/**
 * Smoke bundle for refactor automation (static + application + invoice parse).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getRequest, stopTestServer } from './helpers/testServer';

const MANIFEST = path.join(process.cwd(), 'scripts/refactor/app-manifest.json');

describe('Refactor smoke bundle', () => {
  let request: Awaited<ReturnType<typeof getRequest>>;

  before(async () => {
    request = await getRequest();
  });

  after(() => {
    stopTestServer();
  });

  it('app-manifest.json exists and lists tracked apps', () => {
    assert.ok(fs.existsSync(MANIFEST), 'run pnpm refactor:audit first');
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    assert.ok(Array.isArray(m.files));
    assert.ok(typeof m.count === 'number');
  });

  it('GET /organization.html returns 200', async () => {
    const res = await request.get('/organization.html');
    assert.strictEqual(res.status, 200);
  });

  it('GET /application/monster-fight/monster-fight.js returns 200', async () => {
    const res = await request.get('/application/monster-fight/monster-fight.js');
    assert.strictEqual(res.status, 200);
  });

  it('GET /application/tactics-fighter/tactics-fighter.js returns 200', async () => {
    const res = await request.get('/application/tactics-fighter/tactics-fighter.js');
    assert.strictEqual(res.status, 200);
  });
});
