import './env.js'; // first: settings from .env, before anything reads them
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser } from './auth.js';
import authRoutes from './routes/auth.js';
import businessRoutes from './routes/business.js';
import publicRoutes from './routes/public.js';
import clientRoutes from './routes/client.js';
import { HttpError } from './util.js';
import { db, get } from './db.js';
import { backfillPatients } from './model.js';
import { startReminderLoop } from './messaging.js';
import { inlineScriptHashes, jsonBodiesOnly, rateLimit, sameOriginOnly, securityHeaders } from './security.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DIST = path.join(ROOT, 'dist');

const app = express();
app.disable('x-powered-by');
// Only believe X-Forwarded-For when a proxy we run sits in front (Caddy, nginx, a host's HTTPS).
// Believing it otherwise lets anyone pretend to be a new IP and dodge the rate limits.
// TRUST_PROXY=1 → one proxy hop; unset → only a proxy on this same machine.
app.set('trust proxy', process.env.TRUST_PROXY ? (/^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY) : 'loopback');

let inlineHashes = [];
if (!DEV && fs.existsSync(path.join(DIST, 'index.html'))) inlineHashes = inlineScriptHashes(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'));
app.use(securityHeaders({ dev: DEV, inlineHashes }));

app.use('/api', rateLimit('api', 600, 60_000)); // a person clicking around never gets near this
app.use('/api', sameOriginOnly, jsonBodiesOnly);
app.use(express.json({ limit: '256kb' }));
app.use(loadUser);

app.use('/api/auth', authRoutes);
app.use('/api/businesses', businessRoutes);
// online bookings from one address: plenty for a family, too few to flood a calendar
const publicPost = rateLimit('public-post', 20, 60 * 60_000);
app.use('/api/public', (req, res, next) => (req.method === 'POST' ? publicPost(req, res, next) : next()), publicRoutes);
app.use('/api/me', clientRoutes);
// for Docker / uptime checks: answers only when the database does
app.get('/api/health', (_req, res) => {
  get('SELECT 1');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

if (DEV) {
  // One port for everything in development: Vite serves the React app with hot reload
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: path.join(ROOT, 'vite.config.js'),
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('No build found. Run "npm run build" first (or "npm run dev" while developing).');
    process.exit(1);
  }
  // hashed file names never change, so they can be cached for a year; index.html never
  app.use('/assets', express.static(path.join(DIST, 'assets'), { index: false, immutable: true, maxAge: '365d', fallthrough: false }));
  app.use(express.static(DIST, { index: false, maxAge: '1h', dotfiles: 'ignore' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err instanceof HttpError) {
    if (err.extra?.retryAfter) res.setHeader('Retry-After', String(err.extra.retryAfter));
    return res.status(err.status).json({ error: err.code, ...err.extra });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
  // the file server refuses missing files (404) and tricks like /assets/../ (403) itself: pass that on, quietly
  if (req.path.startsWith('/assets/') && err.status >= 400 && err.status < 500) return res.status(err.status).end();
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

// bookings made before patient files existed get theirs
const linked = backfillPatients();
if (linked) console.log(`Linked ${linked} older bookings to patient files`);
startReminderLoop();

const server = app.listen(PORT, HOST, () => {
  // the address it listens on, so a HOST=127.0.0.1 that didn't take effect shows
  console.log(`Programo running on http://localhost:${PORT}${DEV ? '  (dev mode)' : ''}, listening on ${HOST}`);
});
// slow or stuck connections are cut instead of piling up
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 10_000;

// finish what is running, then stop (docker stop, Ctrl-C). Closing the database folds its write-ahead log back
// into app.db, so after a clean stop app.db alone is the whole database.
const stop = () => {
  try {
    db.close();
  } catch {
    // already closed
  }
  process.exit(0);
};
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(stop);
    setTimeout(stop, 5000).unref();
  });
}
