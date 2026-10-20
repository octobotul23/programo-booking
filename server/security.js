// Defences that sit in front of every route: security headers, cross-site request blocking,
// rate limits, encryption of stored secrets, two-factor codes and the audit trail.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { all, run } from './db.js';
import { fail } from './util.js';

/* ───────── headers ───────── */

/**
 * Tells the browser to refuse anything the app does not need: other sites framing it, scripts from
 * anywhere but this server, guessing file types... `inlineHashes` are the sha256 of the small inline
 * scripts in index.html (the theme is set before React starts), so no other inline script can run.
 */
export function securityHeaders({ dev = false, inlineHashes = [] } = {}) {
  const csp = [
    "default-src 'self'",
    `script-src 'self'${inlineHashes.map((h) => ` 'sha256-${h}'`).join('')}`,
    // React sets style="" attributes (widths, colours) — styles cannot run code
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
  ].join('; ');
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Vite's dev server injects its own inline scripts for hot reload
    if (!dev) res.setHeader('Content-Security-Policy', csp);
    // patient data must not stay in shared-computer caches
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  };
}

/** sha256 (base64) of every inline <script> in a built index.html, for the CSP above. */
export function inlineScriptHashes(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((s) => s.trim())
    .map((s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64'));
}

/* ───────── cross-site requests ───────── */

const EXTRA_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
);

/**
 * Another website must never be able to make a logged-in browser change something here
 * (CSRF). Browsers always say where a request comes from; anything that changes data must
 * come from this same site (or an origin listed in ALLOWED_ORIGINS, e.g. the mobile app).
 */
export function sameOriginOnly(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const site = req.headers['sec-fetch-site'];
  const origin = req.headers.origin;
  if (origin && origin !== 'null') {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      fail(403, 'cross_site');
    }
    if (host === req.headers.host || EXTRA_ORIGINS.has(origin.replace(/\/$/, ''))) return next();
    fail(403, 'cross_site');
  }
  if (origin === 'null' || site === 'cross-site') fail(403, 'cross_site');
  // no Origin at all: not a browser (curl, a server) — it cannot carry someone else's cookie
  next();
}

/** Bodies must be JSON: an HTML form on another site cannot send JSON without asking first. */
export function jsonBodiesOnly(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(req.method)) return next();
  const len = Number(req.headers['content-length'] || 0);
  const chunked = !!req.headers['transfer-encoding'];
  if ((len > 0 || chunked) && !req.is('application/json')) fail(415, 'json_only');
  next();
}

/* ───────── rate limits ───────── */

/** The visitor's address. Only trusted when the app is told a proxy sits in front (TRUST_PROXY). */
export const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

// `npm run dev` on this computer: test scripts log in again and again from 127.0.0.1, so they get
// more room. Anyone else (other devices, Tailscale, the internet) always gets the real limits.
const DEV = process.argv.includes('--dev');
const relaxed = (req) => DEV && !!req && /^(::1$|127\.|::ffff:127\.)/.test(clientIp(req));

const buckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

/** Counts hits per key in a time window; past `max` the request is refused until the window ends. */
export function hit(key, max, windowMs, req) {
  if (relaxed(req)) max *= 20;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) {
    b = { n: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.n++;
  if (b.n > max) fail(429, 'too_many_attempts', { retryAfter: Math.ceil((b.reset - now) / 1000) });
  return b;
}
/** Refuses when `key` already has `max` hits, without counting this one (pair with `miss`). */
export function guard(key, max, req) {
  if (relaxed(req)) max *= 20;
  const b = buckets.get(key);
  if (b && b.reset >= Date.now() && b.n >= max) fail(429, 'too_many_attempts', { retryAfter: Math.ceil((b.reset - Date.now()) / 1000) });
}
/** Counts one failure for `key` (never refuses: `guard` does that on the next try). */
export function miss(key, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) buckets.set(key, (b = { n: 0, reset: now + windowMs }));
  b.n++;
}
export const clearHits = (key) => buckets.delete(key);
export const hitsLeft = (key, max) => Math.max(0, max - (buckets.get(key)?.n ?? 0));

/** Middleware: at most `max` requests per IP per window for these routes. */
export const rateLimit = (name, max, windowMs) => (req, res, next) => {
  try {
    hit(`${name}:${clientIp(req)}`, max, windowMs, req);
  } catch (e) {
    if (e.extra?.retryAfter) res.setHeader('Retry-After', String(e.extra.retryAfter));
    throw e;
  }
  next();
};

/* ───────── passwords ───────── */

// the passwords tried first by every attacker
const COMMON = new Set(
  `123456 1234567 12345678 123456789 1234567890 password password1 password123 parola parola123 qwerty qwerty123 qwertyuiop
  111111 000000 123123 abc123 iloveyou admin admin123 welcome letmein monkey dragon football baseball sunshine princess
  master shadow superman michael 654321 666666 777777 888888 121212 trustno1 starwars azerty 1q2w3e4r 1qaz2wsx zaq12wsx
  asdfghjkl romania bucuresti programo clinica doctor parolamea`.split(/\s+/),
);

/** Returns an error code when a new password is too weak, else null. */
export function weakPassword(password, { email = '', name = '' } = {}) {
  const p = String(password);
  if (p.length < 8) return 'password_too_short';
  if (p.length > 200) return 'password_too_long';
  const low = p.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(p) || /^\d+$/.test(p) && p.length < 10) return 'password_too_common';
  const local = email.split('@')[0].toLowerCase();
  if ((local.length >= 4 && low.includes(local)) || (name && low === name.toLowerCase().replace(/\s+/g, ''))) return 'password_like_name';
  return null;
}

/* ───────── stored secrets ───────── */

// APP_SECRET (env) or a random key kept next to the database. Provider tokens and two-factor
// secrets are encrypted with it, so a copied database file alone does not reveal them.
function loadKey() {
  if (process.env.APP_SECRET) return crypto.createHash('sha256').update(process.env.APP_SECRET).digest();
  const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const file = path.join(dir, '.secret');
  try {
    return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  } catch {
    const key = crypto.randomBytes(32);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, key.toString('base64'), { mode: 0o600 });
    return key;
  }
}
const KEY = loadKey();

export function seal(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `enc:${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')}`;
}

export function unseal(value) {
  if (!value || !String(value).startsWith('enc:')) return value || ''; // stored before encryption existed
  try {
    const raw = Buffer.from(String(value).slice(4), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return ''; // wrong key (APP_SECRET changed): treat as not set
  }
}

/** Session tokens are stored hashed: a leaked database cannot be used to log in. */
export const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/* ───────── two-factor codes (RFC 6238, the 6 digits in Google Authenticator & co.) ───────── */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  return bits.match(/.{5}/g).map((c) => B32[parseInt(c, 2)]).join('');
}
const fromB32 = (s) => {
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
};
function totpAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', fromB32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
/** The time step the code matches (allowing one step of clock drift each way), or 0. */
export function checkTotp(secret, code, lastStep = 0) {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return 0;
  const now = Math.floor(Date.now() / 30000);
  for (const step of [now - 1, now, now + 1]) {
    // a code works once: replaying a code seen over someone's shoulder fails
    if (step > lastStep && crypto.timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(c))) return step;
  }
  return 0;
}
export const totpUri = (secret, account, issuer = 'Programo') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

export function newBackupCodes(n = 8) {
  const codes = Array.from({ length: n }, () => crypto.randomBytes(5).toString('hex').replace(/(.{5})/, '$1-'));
  return { codes, hashes: codes.map((c) => tokenHash(c.replace('-', ''))) };
}

/* ───────── audit trail ───────── */

/** Remembers who did something sensitive, from where and when. Never stores passwords or codes. */
export function audit(req, action, { businessId = null, userId, detail = {} } = {}) {
  try {
    run(
      'INSERT INTO audit_log (business_id, user_id, action, detail, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      businessId,
      userId ?? req?.user?.id ?? null,
      action,
      JSON.stringify(detail),
      req ? clientIp(req) : '',
      String(req?.headers?.['user-agent'] ?? '').slice(0, 200),
      new Date().toISOString(),
    );
  } catch (e) {
    console.error('audit failed', e.message);
  }
}

/** A business's log: what happened in it, plus the account events (logins, passwords, 2FA) of its team. */
export const auditFor = (businessId, userIds, { limit = 100, before = 0 } = {}) =>
  all(
    `SELECT a.*, u.name AS user_name, u.email AS user_email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE (a.business_id = ? OR (a.business_id IS NULL AND a.user_id IN (${userIds.map(() => '?').join(',') || 'NULL'})))
     ${before ? 'AND a.id < ?' : ''} ORDER BY a.id DESC LIMIT ?`,
    businessId,
    ...userIds,
    ...(before ? [before] : []),
    limit,
  ).map((row) => ({
    id: row.id,
    action: row.action,
    detail: JSON.parse(row.detail || '{}'),
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    ip: row.ip,
    userAgent: row.user_agent,
    at: row.created_at,
  }));

export const userLogins = (userId, limit = 20) =>
  all("SELECT * FROM audit_log WHERE user_id = ? AND action LIKE 'login%' ORDER BY id DESC LIMIT ?", userId, limit);

