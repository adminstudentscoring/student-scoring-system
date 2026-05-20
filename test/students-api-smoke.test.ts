/**
 * Smoke: students CRUD minimal path.
 * Run: `pnpm test:students`
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
let studentId = '';

describe('Students API smoke', () => {
  before(async () => {
    request = await getRequest();
    const org = await registerTestOrg(request, {
      organizationName: `StudentsSmokeOrg_${SUFFIX}`,
      email: `students_smoke_${SUFFIX}@example.com`
    });
    orgToken = org.token;
  });

  after(() => {
    stopTestServer();
  });

  it('GET /api/students returns list', async () => {
    const res = await request
      .get('/api/students')
      .set('Authorization', `Bearer ${orgToken}`);
    assert.strictEqual(res.status, 200, res.text);
    assert.ok(Array.isArray(res.body.students) || Array.isArray(res.body));
  });

  it('POST /api/students creates student', async () => {
    const res = await request
      .post('/api/students')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ name: `Smoke Student ${SUFFIX}`, chessComId: `smoke_${SUFFIX}` })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 200, res.text);
    assert.ok(res.body.id);
    studentId = res.body.id;
  });

  it('PUT /api/students/:id updates student', async () => {
    const res = await request
      .put(`/api/students/${studentId}`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ name: `Smoke Updated ${SUFFIX}` })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 200, res.text);
    assert.strictEqual(res.body.name, `Smoke Updated ${SUFFIX}`);
  });

  it('DELETE /api/students/:id removes student', async () => {
    const res = await request
      .delete(`/api/students/${studentId}`)
      .set('Authorization', `Bearer ${orgToken}`);
    assert.strictEqual(res.status, 200, res.text);
  });
});
