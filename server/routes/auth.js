import crypto from 'node:crypto';
import { Router } from 'express';
import { get, run, tx } from '../db.js';
import { dropResets, findReset } from '../resets.js';
import { endOtherSessions, endSession, endSessionById, hashPassword, listSessions, requireUser, startSession, verifyPassword } from '../auth.js';
import { businessesFor, toBusiness, toMember } from '../model.js';
import { audit, checkTotp, clearHits, clientIp, guard, hit, miss, newBackupCodes, newTotpSecret, seal, tokenHash, totpUri, unseal, userLogins, weakPassword } from '../security.js';
import { fail, isEmail, parseJSON, str } from '../util.js';

const r = Router();
const MIN = 60_000;

const me = (user) => ({ user, businesses: businessesFor(user) });
const publicUser = (row) => ({ id: row.id, email: row.email, name: row.name, phone: row.phone, role: row.role, lang: row.lang, theme: row.theme, twoFactor: !!row.totp_enabled });

r.post('/register', (req, res) => {
  hit(`register:${clientIp(req)}`, 10, 60 * MIN, req);
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 160).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = req.body.role === 'business' ? 'business' : 'client';
  const lang = req.body.lang === 'ro' ? 'ro' : 'en';
  if (!name) fail(400, 'name_required');
  if (!isEmail(email)) fail(400, 'invalid_email');
  const weak = weakPassword(password, { email, name });
  if (weak) fail(400, weak);
  if (get('SELECT 1 FROM users WHERE email = ?', email)) fail(409, 'email_taken');

  const { lastInsertRowid } = run(
    'INSERT INTO users (email, password_hash, name, phone, role, lang, theme) VALUES (?, ?, ?, ?, ?, ?, ?)',
    email,
    hashPassword(password),
    name,
    str(req.body.phone, 40),
    role,
    lang,
    req.body.theme === 'dark' ? 'dark' : 'light',
  );
  startSession(req, res, lastInsertRowid);
  audit(req, 'register', { userId: Number(lastInsertRowid) });
  res.status(201).json(me(publicUser(get('SELECT * FROM users WHERE id = ?', lastInsertRowid))));
});

/* ───────── login (password, then the 6-digit code when two-factor is on) ───────── */

// short-lived proof that the password was right, waiting for the code
const tickets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of tickets) if (t.exp < now) tickets.delete(k);
}, MIN).unref();

r.post('/login', (req, res) => {
  const email = str(req.body.email, 160).toLowerCase();
  // per IP: slows one machine trying many accounts. Per address only wrong passwords count, so a
  // stranger cannot lock someone out just by trying: 10 misses from one IP, 50 from everywhere.
  const ip = clientIp(req);
  hit(`login-ip:${ip}`, 30, 15 * MIN, req);
  guard(`login-miss:${email}:${ip}`, 10, req);
  guard(`login-miss:${email}`, 50, req);
  const row = get('SELECT * FROM users WHERE email = ?', email);
  if (!verifyPassword(String(req.body.password ?? ''), row?.password_hash)) {
    miss(`login-miss:${email}:${ip}`, 15 * MIN);
    miss(`login-miss:${email}`, 15 * MIN);
    if (row) audit(req, 'login_failed', { userId: row.id });
    fail(401, 'invalid_login');
  }
  clearHits(`login-miss:${email}:${ip}`);
  if (row.totp_enabled) {
    const ticket = crypto.randomBytes(24).toString('base64url');
    tickets.set(ticket, { userId: row.id, exp: Date.now() + 5 * MIN, tries: 0 });
    return res.json({ twoFactor: true, ticket });
  }
  startSession(req, res, row.id);
  audit(req, 'login', { userId: row.id });
  res.json(me(publicUser(row)));
});

r.post('/login/code', (req, res) => {
  hit(`login-code:${clientIp(req)}`, 20, 15 * MIN, req);
  const ticket = tickets.get(String(req.body.ticket ?? ''));
  if (!ticket || ticket.exp < Date.now()) fail(401, 'login_expired');
  if (++ticket.tries > 5) {
    tickets.delete(String(req.body.ticket));
    fail(401, 'login_expired');
  }
  const row = get('SELECT * FROM users WHERE id = ?', ticket.userId);
  const method = useSecondFactor(row, req.body.code);
  if (!method) {
    audit(req, 'login_code_failed', { userId: row.id });
    fail(401, 'invalid_code');
  }
  tickets.delete(String(req.body.ticket));
  startSession(req, res, row.id);
  audit(req, 'login', { userId: row.id, detail: { method } });
  res.json(me(publicUser(row)));
});

/** Accepts an authenticator code or one unused backup code; returns how, or null. */
function useSecondFactor(row, code) {
  if (!row?.totp_enabled) return null;
  const step = checkTotp(unseal(row.totp_secret), code, row.totp_last);
  if (step) {
    run('UPDATE users SET totp_last = ? WHERE id = ?', step, row.id);
    return 'code';
  }
  const backup = parseJSON(row.totp_backup, []);
  const h = tokenHash(String(code ?? '').replace(/[\s-]/g, '').toLowerCase());
  if (backup.includes(h)) {
    run('UPDATE users SET totp_backup = ? WHERE id = ?', JSON.stringify(backup.filter((x) => x !== h)), row.id);
    return 'backup';
  }
  return null;
}

r.post('/logout', (req, res) => {
  if (req.user) audit(req, 'logout');
  endSession(req, res);
  res.json({ ok: true });
});

r.get('/me', (req, res) => {
  res.json(req.user ? me(req.user) : { user: null, businesses: [] });
});

r.patch('/me', requireUser, (req, res) => {
  const u = req.user;
  // check the current password before changing anything at all
  if (req.body.newPassword) {
    hit(`password:${u.id}`, 10, 15 * MIN, req);
    const row = get('SELECT password_hash FROM users WHERE id = ?', u.id);
    if (!verifyPassword(String(req.body.currentPassword ?? ''), row.password_hash)) fail(400, 'wrong_password');
    const weak = weakPassword(String(req.body.newPassword), { email: u.email, name: u.name });
    if (weak) fail(400, weak);
  }
  const name = 'name' in req.body ? str(req.body.name, 120) || u.name : u.name;
  const phone = 'phone' in req.body ? str(req.body.phone, 40) : u.phone;
  const lang = ['en', 'ro'].includes(req.body.lang) ? req.body.lang : u.lang;
  const theme = ['light', 'dark'].includes(req.body.theme) ? req.body.theme : u.theme;
  run('UPDATE users SET name = ?, phone = ?, lang = ?, theme = ? WHERE id = ?', name, phone, lang, theme, u.id);
  if (req.body.newPassword) {
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(req.body.newPassword)), u.id);
    // a stolen session stops working the moment the password changes, and so does any reset link
    endOtherSessions(req, u.id);
    dropResets(u.id);
    audit(req, 'password_changed');
  }
  res.json(me({ ...u, name, phone, lang, theme }));
});

/* ───────── security page: two-factor, devices, recent logins ───────── */

r.get('/security', requireUser, (req, res) => {
  const row = get('SELECT totp_enabled, totp_backup FROM users WHERE id = ?', req.user.id);
  res.json({
    twoFactor: !!row.totp_enabled,
    backupLeft: row.totp_enabled ? parseJSON(row.totp_backup, []).length : 0,
    sessions: listSessions(req, req.user.id),
    logins: userLogins(req.user.id, 15).map((a) => ({ id: a.id, action: a.action, ip: a.ip, userAgent: a.user_agent, at: a.created_at })),
  });
});

const confirmPassword = (req) => {
  hit(`password:${req.user.id}`, 10, 15 * MIN, req);
  const row = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(String(req.body.password ?? ''), row.password_hash)) fail(400, 'wrong_password');
  return row;
};

r.post('/2fa/setup', requireUser, (req, res) => {
  const row = confirmPassword(req);
  if (row.totp_enabled) fail(409, 'already_enabled');
  const secret = newTotpSecret();
  run('UPDATE users SET totp_secret = ?, totp_last = 0 WHERE id = ?', seal(secret), row.id);
  res.json({ secret, uri: totpUri(secret, row.email) });
});

r.post('/2fa/enable', requireUser, (req, res) => {
  hit(`2fa:${req.user.id}`, 10, 15 * MIN, req);
  const row = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (row.totp_enabled) fail(409, 'already_enabled');
  const step = checkTotp(unseal(row.totp_secret), req.body.code);
  if (!step) fail(400, 'invalid_code');
  const { codes, hashes } = newBackupCodes();
  run('UPDATE users SET totp_enabled = 1, totp_last = ?, totp_backup = ? WHERE id = ?', step, JSON.stringify(hashes), row.id);
  endOtherSessions(req, row.id);
  audit(req, '2fa_enabled');
  res.json({ backupCodes: codes });
});

r.post('/2fa/disable', requireUser, (req, res) => {
  const row = confirmPassword(req);
  if (!row.totp_enabled) return res.json({ ok: true });
  if (!useSecondFactor(row, req.body.code)) fail(400, 'invalid_code');
  run("UPDATE users SET totp_enabled = 0, totp_secret = '', totp_last = 0, totp_backup = '[]' WHERE id = ?", row.id);
  audit(req, '2fa_disabled');
  res.json({ ok: true });
});

r.post('/2fa/backup', requireUser, (req, res) => {
  const row = confirmPassword(req);
  if (!row.totp_enabled) fail(400, 'not_enabled');
  const { codes, hashes } = newBackupCodes();
  run('UPDATE users SET totp_backup = ? WHERE id = ?', JSON.stringify(hashes), row.id);
  audit(req, '2fa_backup_renewed');
  res.json({ backupCodes: codes });
});

r.delete('/sessions/:id', requireUser, (req, res) => {
  endSessionById(req.user.id, req.params.id);
  audit(req, 'session_ended');
  res.json({ ok: true });
});

r.post('/sessions/end-others', requireUser, (req, res) => {
  endOtherSessions(req, req.user.id);
  audit(req, 'sessions_ended');
  res.json({ ok: true });
});

/* ───────── password reset links (made by an owner for their team, or on the server) ───────── */

const resetFor = (req) => {
  hit(`reset:${clientIp(req)}`, 30, 15 * MIN, req);
  const row = findReset(String(req.params.token));
  if (!row) fail(404, 'reset_not_found');
  return row;
};

r.get('/reset/:token', (req, res) => {
  const row = resetFor(req);
  res.json({ name: row.name, email: row.email });
});

r.post('/reset/:token', (req, res) => {
  const row = resetFor(req);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const weak = weakPassword(password, { email: row.email, name: row.name });
  if (weak) fail(400, weak);
  tx(() => {
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), row.user_id);
    dropResets(row.user_id);
    // every device logs in again, with the new password
    run('DELETE FROM sessions WHERE user_id = ?', row.user_id);
  });
  clearHits(`login-miss:${row.email}`);
  audit(req, 'password_reset', { userId: row.user_id });
  // no session here: logging in goes through the normal door, so two-step login still asks for its code
  res.json({ ok: true, email: row.email, twoFactor: !!row.totp_enabled });
});

/* ───────── staff invites ───────── */

const inviteFor = (req) => {
  hit(`invite:${clientIp(req)}`, 30, 15 * MIN, req);
  const m = toMember(get('SELECT * FROM members WHERE invite_token = ? AND user_id IS NULL', String(req.params.token)));
  if (!m) fail(404, 'invite_not_found');
  return { member: m, biz: toBusiness(get('SELECT * FROM businesses WHERE id = ?', m.businessId)) };
};

r.get('/invite/:token', (req, res) => {
  const { member, biz } = inviteFor(req);
  const existing = get('SELECT role FROM users WHERE email = ?', member.email);
  res.json({
    name: member.name,
    email: member.email,
    business: { id: biz.id, name: biz.name, type: biz.type },
    // someone already working elsewhere logs in with the password they have
    hasAccount: existing?.role === 'staff',
    blocked: !!existing && existing.role !== 'staff',
  });
});

r.post('/invite/:token', (req, res) => {
  const { member, biz } = inviteFor(req);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const existing = get('SELECT * FROM users WHERE email = ?', member.email);
  let userId;
  if (existing) {
    if (existing.role !== 'staff') fail(409, 'email_other_account');
    const ip = clientIp(req);
    guard(`login-miss:${member.email}:${ip}`, 10, req);
    guard(`login-miss:${member.email}`, 50, req);
    if (!verifyPassword(password, existing.password_hash)) {
      miss(`login-miss:${member.email}:${ip}`, 15 * MIN);
      miss(`login-miss:${member.email}`, 15 * MIN);
      fail(401, 'invalid_login');
    }
    // an account with two-factor also needs its code
    if (existing.totp_enabled) {
      if (!req.body.code) fail(401, 'code_required');
      if (!useSecondFactor(existing, req.body.code)) {
        miss(`login-miss:${member.email}:${ip}`, 15 * MIN);
        fail(401, 'invalid_code');
      }
    }
    userId = existing.id;
  } else {
    const name = str(req.body.name, 120) || member.name;
    const weak = weakPassword(password, { email: member.email, name });
    if (weak) fail(400, weak);
    userId = run(
      'INSERT INTO users (email, password_hash, name, phone, role, lang, theme) VALUES (?, ?, ?, ?, ?, ?, ?)',
      member.email,
      hashPassword(password),
      name,
      str(req.body.phone, 40),
      'staff',
      req.body.lang === 'ro' ? 'ro' : 'en',
      req.body.theme === 'dark' ? 'dark' : 'light',
    ).lastInsertRowid;
  }
  run('UPDATE members SET user_id = ?, invite_token = NULL WHERE id = ?', userId, member.id);
  startSession(req, res, userId);
  audit(req, 'invite_accepted', { businessId: biz.id, userId: Number(userId), detail: { member: member.name } });
  res.json({ ...me(publicUser(get('SELECT * FROM users WHERE id = ?', userId))), businessId: biz.id });
});

export default r;
