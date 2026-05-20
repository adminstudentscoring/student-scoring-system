/**
 * Smoke: organization orders list/create minimal path.
 * Run: `pnpm test:orders`
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

describe('Orders API smoke', () => {
  before(async () => {
    request = await getRequest();
    const org = await registerTestOrg(request, {
      organizationName: `OrdersSmokeOrg_${SUFFIX}`,
      email: `orders_smoke_${SUFFIX}@example.com`
    });
    orgToken = org.token;
  });

  after(() => {
    stopTestServer();
  });

  it('GET /api/organizations/orders returns array', async () => {
    const res = await request
      .get('/api/organizations/orders')
      .set('Authorization', `Bearer ${orgToken}`);
    assert.strictEqual(res.status, 200, res.text);
    assert.ok(Array.isArray(res.body));
  });

  it('creates student for order', async () => {
    const res = await request
      .post('/api/students')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ name: `Orders Smoke ${SUFFIX}`, chessComId: `ord_smoke_${SUFFIX}` })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 200, res.text);
    studentId = res.body.id;
  });

  it('POST /api/organizations/orders creates unpaid order', async () => {
    const res = await request
      .post('/api/organizations/orders')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        studentId,
        items: [
          {
            productType: 'package',
            productData: { id: `pkg_${SUFFIX}`, name: 'Smoke pkg' },
            price: 100,
            enrolledClasses: [
              { id: `tt_${SUFFIX}`, dateString: '2026-05-01' }
            ]
          }
        ],
        paymentStatus: 'unpaid',
        paymentDetails: null
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 201, res.text);
    assert.ok(res.body.id);
    assert.strictEqual(res.body.status, 'unpaid');
    assert.strictEqual(Number(res.body.totalAmount), 100);

    const getOne = await request
      .get(`/api/organizations/orders/${res.body.id}`)
      .set('Authorization', `Bearer ${orgToken}`);
    assert.strictEqual(getOne.status, 200, getOne.text);
    assert.strictEqual(getOne.body.id, res.body.id);
  });

  it('GET /api/organizations/orders without auth returns 401', async () => {
    const res = await request.get('/api/organizations/orders');
    assert.strictEqual(res.status, 401);
  });
});
