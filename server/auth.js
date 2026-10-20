import crypto from 'node:crypto';
import { all, get, run } from './db.js';
import { fail } from './util.js';
import { clientIp, tokenHash } from './security.js';

const SESSION_DAYS = 30; // hard limit, even for someone using the app every day
const IDLE_DAYS = 14; // a forgotten login on a shared computer ends sooner
const MAX_SESSIONS = 20; // per user; the oldest go first
const COOKIE = 'sid';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// checked when the email does not exist, so a wrong email takes as long as a wrong password
const DUMMY = hashPassword(crypto.randomBytes(12).toString('hex'));

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || DUMMY).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password).slice(0, 200), salt, 64);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test) && !!stored;
}

const parseCookies = (header = '') =>
  Object.fromEntries(
    header
      .split(';')
      .map((p) => p.trim().split('='))
      .filter(([k, v]) => k && v)
      .map(([k, v]) => {
        try {
          return [k, decodeURIComponent(v)];
        } catch {
          return [k, ''];
        }
      }),
  );

const cookieToken = (req) => parseCookies(req.headers.cookie)[COOKIE];

export function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = SESSION_DAYS * 864e5;
  const now = Date.now();
  // whoever logs in on this browser replaces the previous login here
  const old = cookieToken(req);
  if (old) run('DELETE FROM sessions WHERE token = ?', tokenHash(old));
  run(
    'INSERT INTO sessions (token, user_id, expires_at, created_at, last_seen, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
    tokenHash(token),
    userId,
    now + maxAge,
    now,
    now,
    clientIp(req),
    String(req.headers['user-agent'] ?? '').slice(0, 200),
  );
  run(
    'DELETE FROM sessions WHERE user_id = ? AND token NOT IN (SELECT token FROM sessions WHERE user_id = ? ORDER BY last_seen DESC LIMIT ?)',
    userId,
    userId,
    MAX_SESSIONS,
  );
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge, path: '/' });
}

export function endSession(req, res) {
  const token = cookieToken(req);
  if (token) run('DELETE FROM sessions WHERE token = ?', tokenHash(token));
  res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: req.secure });
}

/** Logs a user out everywhere except (optionally) the browser making this request. */
export function endOtherSessions(req, userId) {
  const token = cookieToken(req);
  run('DELETE FROM sessions WHERE user_id = ? AND token != ?', userId, token ? tokenHash(token) : '');
}

/** The user's logged-in devices, newest first; `current` marks this browser. */
export function listSessions(req, userId) {
  const mine = cookieToken(req) ? tokenHash(cookieToken(req)) : '';
  return all('SELECT token, created_at, last_seen, ip, user_agent FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC', userId, Date.now()).map(
    (s) => ({
      // a short public id: enough to end that session, useless to log in with
      id: s.token.slice(0, 16),
      createdAt: new Date(s.created_at).toISOString(),
      lastSeen: new Date(s.last_seen).toISOString(),
      ip: s.ip,
      userAgent: s.user_agent,
      current: s.token === mine,
    }),
  );
}

export function endSessionById(userId, id) {
  if (!/^[0-9a-f]{16}$/.test(String(id))) fail(404, 'not_found');
  const { changes } = run("DELETE FROM sessions WHERE user_id = ? AND substr(token, 1, 16) = ?", userId, id);
  if (!changes) fail(404, 'not_found');
}

/** Attaches req.user when a valid session cookie is present. */
export function loadUser(req, _res, next) {
  const token = cookieToken(req);
  req.user = null;
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const now = Date.now();
    const hash = tokenHash(token);
    const row = get(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.lang, u.theme, u.totp_enabled, s.last_seen FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND s.last_seen > ?`,
      hash,
      now,
      now - IDLE_DAYS * 864e5,
    );
    if (row) {
      const { last_seen, totp_enabled, ...user } = row;
      req.user = { ...user, twoFactor: !!totp_enabled };
      // keep "last active" roughly current without writing on every request
      if (now - last_seen > 5 * 60_000) run('UPDATE sessions SET last_seen = ?, ip = ? WHERE token = ?', now, clientIp(req), hash);
    }
  }
  next();
}

export function requireUser(req, _res, next) {
  if (!req.user) fail(401, 'not_logged_in');
  next();
}

export function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user) fail(401, 'not_logged_in');
    if (req.user.role !== role) fail(403, 'wrong_account_type');
    next();
  };
}

// Housekeeping: drop expired sessions on boot and every few hours
const sweep = () => run('DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?', Date.now(), Date.now() - IDLE_DAYS * 864e5);
sweep();
setInterval(sweep, 6 * 3600_000).unref();
