/**
 * Smoke: lesson quota settlement via HTTP (PATCH paid + lesson_quota, POST new order + lesson_quota).
 *
 * Set TEST_BASE_URL to your running server (e.g. http://127.0.0.1:7001).
 * If PATCH returns 200 but the order stays `unpaid` with `paymentDetails.method === 'lesson_quota'`,
 * the server process is almost certainly running **old code** (before the lesson_quota PATCH branch) — restart it.
 *
 * Run: `pnpm test:lesson-quota` or `TEST_BASE_URL=http://127.0.0.1:PORT pnpm test:lesson-quota`
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import { ChildProcess, spawn } from 'node:child_process';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
let serverProcess: ChildProcess | null = null;
let request: ReturnType<typeof supertest>;

const SUFFIX = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TEST_ORG_NAME = `QuotaSmokeOrg_${SUFFIX}`;
const TEST_EMAIL = `quota_smoke_${SUFFIX}@example.com`;
const TEST_PHONE = '12345678';
const TEST_PASSWORD = 'testpassword123';

let authToken = '';
let studentIdA = '';
let studentIdB = '';

function eightLessonItems(totalPrice: number) {
  const enrolledClasses = Array.from({ length: 8 }, (_, i) => ({
    id: `smoke_tt_${SUFFIX}_${i}`,
    dateString: `2026-06-${String(10 + i).padStart(2, '0')}`
  }));
  return [
    {
      productType: 'package',
      productData: { id: `pkg_smoke_${SUFFIX}`, name: 'Smoke package' },
      price: totalPrice,
      enrolledClasses
    }
  ];
}

describe('Lesson quota API smoke', () => {
  before(async () => {
    request = supertest(BASE_URL);
    try {
      await request.get('/').timeout({ response: 2000 });
      return;
    } catch {
      // Server not running — start it
    }
    serverProcess = spawn('npx', ['tsx', 'server.ts'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: { ...process.env }
    });
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      try {
        await supertest(BASE_URL).get('/').timeout({ response: 1000 });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('Server did not start within 25 seconds');
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    }
  });

  it('registers org and logs in', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({
        organizationName: TEST_ORG_NAME,
        email: TEST_EMAIL,
        phone: TEST_PHONE,
        password: TEST_PASSWORD
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 201, res.text);
    assert.ok(res.body.token);
    authToken = res.body.token;
  });

  it('creates two students', async () => {
    const a = await request
      .post('/api/students')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Quota Smoke A', chessComId: `qsmoke_a_${SUFFIX}` })
      .set('Content-Type', 'application/json');
    assert.strictEqual(a.status, 200, a.text);
    studentIdA = a.body.id;

    const b = await request
      .post('/api/students')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Quota Smoke B', chessComId: `qsmoke_b_${SUFFIX}` })
      .set('Content-Type', 'application/json');
    assert.strictEqual(b.status, 200, b.text);
    studentIdB = b.body.id;
  });

  it('PATCH /orders/:id/status with lesson_quota settles unpaid order and deducts quota', async () => {
    const unitCents = 22500; // $225/lesson × 8 = $1800 line
    const putQ = await request
      .put(`/api/students/${studentIdA}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ lessonQuotaByCents: { [String(unitCents)]: 8 } })
      .set('Content-Type', 'application/json');
    assert.strictEqual(putQ.status, 200, putQ.text);

    const items = eightLessonItems(1800);
    const create = await request
      .post('/api/organizations/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: studentIdA,
        items,
        paymentStatus: 'unpaid',
        paymentDetails: null
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(create.status, 201, create.text);
    const orderId = create.body.id;
    assert.strictEqual(create.body.status, 'unpaid');

    const patch = await request
      .patch(`/api/organizations/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        status: 'paid',
        paymentDetails: {
          method: 'lesson_quota',
          amount: 0,
          balanceUsed: 0,
          remark: 'smoke PATCH lesson_quota'
        }
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(patch.status, 200, patch.text);
    assert.strictEqual(patch.body.status, 'paid');
    assert.strictEqual(Number(patch.body.amountPaid), 1800);

    const listA = await request.get('/api/students').set('Authorization', `Bearer ${authToken}`);
    assert.strictEqual(listA.status, 200, listA.text);
    const rowA = (listA.body as any[]).find((s) => String(s.id) === String(studentIdA));
    assert.ok(rowA, 'student A in list');
    const q = rowA.lessonQuotaByCents || {};
    assert.strictEqual(Number(q[String(unitCents)] || 0), 0, 'quota should be fully consumed');
  });

  it('POST /organizations/orders with lesson_quota creates paid order and deducts quota', async () => {
    const unitCents = 22500;
    const putQ = await request
      .put(`/api/students/${studentIdB}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ lessonQuotaByCents: { [String(unitCents)]: 8 } })
      .set('Content-Type', 'application/json');
    assert.strictEqual(putQ.status, 200, putQ.text);

    const items = eightLessonItems(1800);
    const create = await request
      .post('/api/organizations/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: studentIdB,
        items,
        paymentStatus: 'paid',
        paymentDetails: {
          method: 'lesson_quota',
          amount: 0,
          balanceUsed: 0,
          remark: 'smoke POST lesson_quota'
        }
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(create.status, 201, create.text);
    assert.strictEqual(create.body.status, 'paid');
    assert.strictEqual(Number(create.body.amountPaid), 1800);

    const listB = await request.get('/api/students').set('Authorization', `Bearer ${authToken}`);
    assert.strictEqual(listB.status, 200, listB.text);
    const rowB = (listB.body as any[]).find((s) => String(s.id) === String(studentIdB));
    assert.ok(rowB);
    const q = rowB.lessonQuotaByCents || {};
    assert.strictEqual(Number(q[String(unitCents)] || 0), 0);
  });

  it('PATCH lesson_quota returns 400 when quota insufficient', async () => {
    const unitCents = 50000; // $500/lesson tier — student has no credits here
    const putQ = await request
      .put(`/api/students/${studentIdA}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ lessonQuotaByCents: { '22500': 0, [String(unitCents)]: 1 } })
      .set('Content-Type', 'application/json');
    assert.strictEqual(putQ.status, 200, putQ.text);

    const items = eightLessonItems(1800); // implies $225/lesson — mismatch tier
    const create = await request
      .post('/api/organizations/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: studentIdA,
        items,
        paymentStatus: 'unpaid',
        paymentDetails: null
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(create.status, 201, create.text);
    const orderId = create.body.id;

    const patch = await request
      .patch(`/api/organizations/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        status: 'paid',
        paymentDetails: { method: 'lesson_quota', amount: 0, balanceUsed: 0, remark: 'should fail' }
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(patch.status, 400, patch.text);
    assert.ok(String(patch.body.error || '').includes('Insufficient') || patch.body.error, 'expected insufficient quota error');
  });
});
