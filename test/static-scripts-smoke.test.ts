/**
 * Smoke: HTML pages reference local scripts that exist (disk + HTTP).
 * Run: `pnpm test:static-scripts`
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getRequest, stopTestServer } from './helpers/testServer';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

type PageSpec = {
  html: string;
  path: string;
  scriptFilter: (src: string) => boolean;
  minScripts?: number;
};

const PAGES: PageSpec[] = [
  {
    html: 'organization.html',
    path: '/organization.html',
    scriptFilter: (src) =>
      src.startsWith('course-management-') ||
      src.startsWith('organization-settings-') ||
      src === 'auth.js',
    minScripts: 10
  },
  {
    html: 'teacher.html',
    path: '/teacher.html',
    scriptFilter: (src) =>
      src.startsWith('course-management-') ||
      src.startsWith('teacher-') ||
      src === 'auth.js',
    minScripts: 5
  },
  {
    html: 'admin.html',
    path: '/admin.html',
    scriptFilter: (src) => src.startsWith('admin-') || src === 'auth.js',
    minScripts: 3
  },
  {
    html: 'class-view.html',
    path: '/class-view.html',
    scriptFilter: (src) => src === 'class-view.js' || src.startsWith('class-view-') || src === 'auth.js',
    minScripts: 1
  }
];

function scriptSrcsFromHtml(html: string, filter: (src: string) => boolean): string[] {
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = m[1].split('?')[0];
    if (src.startsWith('http://') || src.startsWith('https://')) continue;
    if (filter(src)) out.push(src);
  }
  return out;
}

describe('Static HTML script smoke', () => {
  let request: Awaited<ReturnType<typeof getRequest>>;

  before(async () => {
    request = await getRequest();
  });

  after(() => {
    stopTestServer();
  });

  for (const page of PAGES) {
    describe(page.html, () => {
      it(`GET ${page.path} returns 200`, async () => {
        const res = await request.get(page.path);
        assert.strictEqual(res.status, 200);
      });

      it(`${page.html} local scripts exist on disk and via HTTP`, async () => {
        const html = fs.readFileSync(path.join(PUBLIC_DIR, page.html), 'utf8');
        const scripts = scriptSrcsFromHtml(html, page.scriptFilter);
        if (page.minScripts != null) {
          assert.ok(
            scripts.length >= page.minScripts,
            `expected at least ${page.minScripts} scripts, got ${scripts.length}`
          );
        }

        for (const src of scripts) {
          const diskPath = path.join(PUBLIC_DIR, src);
          assert.ok(fs.existsSync(diskPath), `missing file: ${src}`);
          const httpRes = await request.get(`/${src}`);
          assert.strictEqual(httpRes.status, 200, `GET /${src} should be 200`);
        }
      });
    });
  }
});
