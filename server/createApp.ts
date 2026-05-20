import type { Express } from 'express';

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const bootstrap = require('./bootstrap');

const {
  ROOT_DIR,
  NODE_ENV,
  CORS_ORIGIN
} = bootstrap;

function createApp(): Express {
  const app: Express = express();

  // Middleware
  // Trust proxy for correct hostname/protocol detection behind reverse proxy (Railway, etc.)
  if (NODE_ENV === 'production') {
    app.set('trust proxy', true);
  }

  // Optional HTTPS enforcement behind reverse proxies.
  // Enable with FORCE_HTTPS=1.
  if (String(process.env.FORCE_HTTPS || '') === '1') {
    app.use((req, res, next) => {
      try {
        const host = String(req.get('host') || req.hostname || '').toLowerCase();
        const isLocalHost = host.includes('localhost') || host.startsWith('127.0.0.1');
        if (isLocalHost) return next();
        const xfProto = String(req.get('x-forwarded-proto') || '')
          .split(',')[0]
          .trim()
          .toLowerCase();
        const xForwardedSsl = String(req.get('x-forwarded-ssl') || '').trim().toLowerCase();
        const cfVisitor = String(req.get('cf-visitor') || '').toLowerCase();
        const isHttps = !!req.secure
          || xfProto === 'https'
          || xForwardedSsl === 'on'
          || cfVisitor.includes('"scheme":"https"');
        if (isHttps) return next();
        const target = `https://${host}${req.originalUrl || req.url || '/'}`;
        if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(301, target);
        return res.redirect(308, target);
      } catch {
        return next();
      }
    });
  }

  // Configure CORS based on environment
  const corsOptions = {
    origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(origin => origin.trim()),
    credentials: true
  };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Avoid noisy 404s in DevTools when no favicon is provided
  app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
  });

  // Serve level badges explicitly (and log missing files) to make production debugging easy.
  app.get('/assets/level-badge/:file', async (req, res) => {
    try {
      const raw = String(req.params.file || '');
      const file = path.basename(raw); // prevent path traversal
      const full = path.join(ROOT_DIR, 'public', 'assets', 'level-badge', file);
      await fs.access(full);
      return res.sendFile(full);
    } catch (e) {
      console.warn('GET /assets/level-badge/:file 404', {
        file: String(req.params.file || ''),
        error: String(e?.message || e)
      });
      return res.status(404).json({ error: 'Not found' });
    }
  });

  // Redirect root domain to www subdomain
  // This handles the DNS limitation where @ (root domain) cannot have CNAME due to MX record conflict
  //
  // IMPORTANT:
  // - Do NOT redirect API calls. Redirecting POST uploads with 301/302 can cause browsers to change POST -> GET.
  // - Only redirect safe methods (GET/HEAD). For other methods, preserve method using 308.
  app.use((req, res, next) => {
    // Get hostname from request, handling both with and without port
    let hostname = req.get('host') || req.hostname || '';
    
    // Remove port number if present (e.g., "studentscoring.com:3000" -> "studentscoring.com")
    if (hostname.includes(':')) {
      hostname = hostname.split(':')[0];
    }
    
    // Check if request is for root domain (without www)
    if (hostname === 'studentscoring.com') {
      const path = req.originalUrl || req.url || '';
      // Never redirect API endpoints (breaks POST/multipart uploads)
      if (String(path).startsWith('/api/')) return next();

      const protocol = req.protocol || (req.secure ? 'https' : 'http') || 'https';
      const redirectUrl = `${protocol}://www.studentscoring.com${path}`;

      // Use 301 permanent redirect for SEO only for safe methods.
      if (req.method === 'GET' || req.method === 'HEAD') {
        return res.redirect(301, redirectUrl);
      }
      // Preserve method/body for non-GET.
      return res.redirect(308, redirectUrl);
    }
    
    next();
  });

  // Serve static files using absolute paths (avoids 404s when server is started from a different cwd)
  app.use(express.static(path.join(ROOT_DIR, 'public')));
  // Chess Analysis board (ES module): chess.js from dependency (CSP script-src 'self')
  app.use(
    '/chess-analysis/vendor',
    express.static(path.join(ROOT_DIR, 'node_modules/chess.js/dist/esm'))
  );
  // Serve application/ (browser bundles for chess apps and mini-games)
  app.use('/application', express.static(path.join(ROOT_DIR, 'application')));
  // Monster Fight standalone entry (same tree; explicit mount for clarity)
  app.use('/application/monster-fight', express.static(path.join(ROOT_DIR, 'application/monster-fight')));

  // Log whether level-badge assets exist at startup (helps diagnose production 404s).
  (async () => {
    try {
      const dir = path.join(ROOT_DIR, 'public', 'assets', 'level-badge');
      const items = await fs.readdir(dir);
      console.log(`[assets] level-badge: ${items.length} file(s)`);
    } catch (e) {
      console.warn('[assets] level-badge: missing/unreadable', String(e?.message || e));
    }
  })();

    

  return app;
}

export {};

module.exports = { createApp };
