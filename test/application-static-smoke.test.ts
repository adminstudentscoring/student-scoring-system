/**
 * Smoke: application game static assets (HTML + bundled JS).
 * Run: `pnpm test:application-static`
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getRequest, stopTestServer } from './helpers/testServer';

type AppSpec = {
  name: string;
  jsPath: string;
  htmlPath?: string;
  marker: string;
};

const APPS: AppSpec[] = [
  {
    name: 'monster-fight',
    htmlPath: '/application/monster-fight/monster-fight.html',
    jsPath: 'application/monster-fight/monster-fight.js',
    marker: 'initMonsterFight'
  },
  {
    name: 'tactics-fighter',
    jsPath: 'application/tactics-fighter/tactics-fighter.js',
    marker: 'initTacticsFighter'
  },
  {
    name: 'blunders',
    jsPath: 'application/blunders/blunders.js',
    marker: 'BlundersEntryApi'
  },
  {
    name: 'chess-works',
    jsPath: 'application/chess-works/chess-works.js',
    marker: 'initChessWorks'
  },
  {
    name: 'hope-mate',
    jsPath: 'application/hope-mate/hope-mate.js',
    marker: 'initHopeMate'
  },
  {
    name: 'vchess-platform',
    jsPath: 'application/vchess-platform/vchess-platform.js',
    marker: 'initVChessPlatform'
  },
  {
    name: 'monster-fight-shell',
    jsPath: 'application/monster-fight-shell.js',
    marker: 'initMonsterFight'
  },
  {
    name: 'truceboard',
    htmlPath: '/application/truceboard/index.html',
    jsPath: 'application/truceboard/truceboard.js',
    marker: 'initClockFromConfig'
  }
];

describe('Application static smoke', () => {
  let request: Awaited<ReturnType<typeof getRequest>>;

  before(async () => {
    request = await getRequest();
  });

  after(() => {
    stopTestServer();
  });

  for (const app of APPS) {
    describe(app.name, () => {
      if (app.htmlPath) {
        it(`GET ${app.htmlPath} returns 200`, async () => {
          const res = await request.get(app.htmlPath);
          assert.strictEqual(res.status, 200);
        });
      }

      it(`GET /${app.jsPath} returns 200`, async () => {
        const diskPath = path.join(process.cwd(), app.jsPath);
        assert.ok(fs.existsSync(diskPath), `bundle missing — run pnpm build:applications`);
        const res = await request.get(`/${app.jsPath}`);
        assert.strictEqual(res.status, 200);
        assert.ok(String(res.text || '').includes(app.marker), `bundle should contain ${app.marker}`);
      });
    });
  }
});
