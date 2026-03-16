const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');
const { spawn } = require('node:child_process');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
let serverProcess;
let request;

describe('API integration tests', () => {
  before(async () => {
    request = supertest(BASE_URL);

    // Check if server is already running
    try {
      await request.get('/').timeout({ response: 2000 });
      return; // Server already running
    } catch {
      // Server not running — start it
    }

    serverProcess = spawn('node', ['server.js'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: { ...process.env },
    });

    // Wait for server to be ready (up to 15 seconds)
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        await supertest(BASE_URL).get('/').timeout({ response: 1000 });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('Server did not start within 15 seconds');
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    }
  });

  // --- Static pages ---

  it('GET / returns 200', async () => {
    const res = await request.get('/');
    assert.strictEqual(res.status, 200);
  });

  it('GET /login.html returns 200', async () => {
    const res = await request.get('/login.html');
    assert.strictEqual(res.status, 200);
  });

  // --- Auth routes ---

  it('POST /api/auth/login with invalid credentials returns 401', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'wrongpassword' })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 401);
  });

  it('POST /api/auth/login with missing body returns 400', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({})
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 400);
  });

  // --- Protected routes (no auth) ---

  it('POST /api/students without auth returns 401', async () => {
    const res = await request
      .post('/api/students')
      .send({ name: 'Test Student' })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/challenge without auth returns 401', async () => {
    const res = await request.get('/api/challenge');
    assert.strictEqual(res.status, 401);
  });
});
