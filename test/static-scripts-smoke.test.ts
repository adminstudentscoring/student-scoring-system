/**
 * Smoke: organization.html references course-management scripts that exist.
 * Run: `pnpm test:static-scripts`
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getRequest, stopTestServer } from './helpers/testServer';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

function scriptSrcsFromHtml(html: string): string[] {
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = m[1].split('?')[0];
    if (src.startsWith('course-management-') || src.startsWith('organization-settings-')) {
      out.push(src);
    }
  }
  return out;
}

describe('Static course-management scripts smoke', () => {
  let request: Awaited<ReturnType<typeof getRequest>>;

  before(async () => {
    request = await getRequest();
  });

  after(() => {
    stopTestServer();
  });

  it('GET /organization.html returns 200', async () => {
    const res = await request.get('/organization.html');
    assert.strictEqual(res.status, 200);
  });

  it('organization.html course-management scripts exist on disk and via HTTP', async () => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'organization.html'), 'utf8');
    const scripts = scriptSrcsFromHtml(html);
    assert.ok(scripts.length >= 10, `expected many course-management scripts, got ${scripts.length}`);

    for (const src of scripts) {
      const diskPath = path.join(PUBLIC_DIR, src);
      assert.ok(fs.existsSync(diskPath), `missing file: ${src}`);
      const httpRes = await request.get(`/${src}`);
      assert.strictEqual(httpRes.status, 200, `GET /${src} should be 200`);
    }
  });
});
