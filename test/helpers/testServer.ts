/**
 * Shared helpers for HTTP smoke / integration tests.
 * Use TEST_BASE_URL to point at a running server; otherwise spawns one.
 */
import supertest from 'supertest';
import { ChildProcess, spawn } from 'node:child_process';

const DEFAULT_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:7001';
const SERVER_START_TIMEOUT_MS = 25000;
const POLL_INTERVAL_MS = 500;

let serverProcess: ChildProcess | null = null;
let requestInstance: ReturnType<typeof supertest> | null = null;

export function getBaseUrl(): string {
  return DEFAULT_BASE_URL;
}

export async function getRequest(): Promise<ReturnType<typeof supertest>> {
  if (requestInstance) return requestInstance;

  requestInstance = supertest(DEFAULT_BASE_URL);
  try {
    await requestInstance.get('/').timeout({ response: 2000 });
    return requestInstance;
  } catch {
    // Server not running — start it
  }

  serverProcess = spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env }
  });

  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await supertest(DEFAULT_BASE_URL).get('/').timeout({ response: 1000 });
      return requestInstance;
    } catch {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  throw new Error(`Server did not start within ${SERVER_START_TIMEOUT_MS / 1000} seconds`);
}

export function stopTestServer(): void {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
  requestInstance = null;
}

export interface RegisterTestOrgOptions {
  organizationName?: string;
  email?: string;
  phone?: string;
  password?: string;
}

export interface RegisterTestOrgResult {
  token: string;
  organizationId: string;
  userId: string;
  email: string;
  password: string;
}

export function uniqueTestSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function registerTestOrg(
  request: ReturnType<typeof supertest>,
  options: RegisterTestOrgOptions = {}
): Promise<RegisterTestOrgResult> {
  const suffix = uniqueTestSuffix();
  const organizationName = options.organizationName ?? `TestOrg_${suffix}`;
  const email = options.email ?? `testorg_${suffix}@example.com`;
  const phone = options.phone ?? '12345678';
  const password = options.password ?? 'testpassword123';

  const res = await request
    .post('/api/auth/register')
    .send({ organizationName, email, phone, password })
    .set('Content-Type', 'application/json');

  if (res.status !== 201) {
    throw new Error(`registerTestOrg failed (${res.status}): ${res.text}`);
  }

  return {
    token: res.body.token,
    organizationId: res.body.organization?.id ?? res.body.user?.organizationId ?? '',
    userId: res.body.user?.id ?? '',
    email,
    password
  };
}

export async function loginTestOrg(
  request: ReturnType<typeof supertest>,
  email: string,
  password: string
): Promise<string> {
  const res = await request
    .post('/api/auth/login')
    .send({ email, password })
    .set('Content-Type', 'application/json');

  if (res.status !== 200) {
    throw new Error(`loginTestOrg failed (${res.status}): ${res.text}`);
  }
  return res.body.token;
}
