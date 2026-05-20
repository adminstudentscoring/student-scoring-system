/**
 * Smoke: organization settings GET/PUT with holidays.
 * Run: `pnpm test:settings-holiday`
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  getRequest,
  registerTestOrg,
  stopTestServer,
  uniqueTestSuffix
} from './helpers/testServer';

const SUFFIX = uniqueTestSuffix();
let request: Awaited<ReturnType<typeof getRequest>>;
let orgToken = '';

describe('Settings holiday smoke', () => {
  before(async () => {
    request = await getRequest();
    const org = await registerTestOrg(request, {
      organizationName: `SettingsSmokeOrg_${SUFFIX}`,
      email: `settings_smoke_${SUFFIX}@example.com`
    });
    orgToken = org.token;
  });

  after(() => {
    stopTestServer();
  });

  it('GET /api/organizations/settings returns scheduleSettings', async () => {
    const res = await request
      .get('/api/organizations/settings')
      .set('Authorization', `Bearer ${orgToken}`);
    assert.strictEqual(res.status, 200, res.text);
    assert.ok(typeof res.body.scheduleSettings === 'object');
  });

  it('PUT /api/organizations/settings updates holidays', async () => {
    const getRes = await request
      .get('/api/organizations/settings')
      .set('Authorization', `Bearer ${orgToken}`);
    const settings = getRes.body;
    const scheduleSettings = {
      ...(settings.scheduleSettings || {}),
      holidays: ['2026-12-25', '2026-12-26']
    };

    const putRes = await request
      .put('/api/organizations/settings')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ ...settings, scheduleSettings })
      .set('Content-Type', 'application/json');
    assert.strictEqual(putRes.status, 200, putRes.text);

    const verify = await request
      .get('/api/organizations/settings')
      .set('Authorization', `Bearer ${orgToken}`);
    assert.strictEqual(verify.status, 200);
    const hol = verify.body?.scheduleSettings?.holidays || [];
    assert.ok(hol.includes('2026-12-25'));
    assert.ok(hol.includes('2026-12-26'));
  });
});
