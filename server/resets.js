import crypto from 'node:crypto';
import { get, run } from './db.js';
import { tokenHash } from './security.js';

/** How long a reset link works. Short: it is sent over chat apps, not a private inbox. */
export const RESET_HOURS = 24;

/** A fresh one-time link for this account; any older link stops working. Only the hash is kept. */
export function newReset(userId, createdBy = null) {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + RESET_HOURS * 36e5;
  run('DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?', userId, Date.now());
  run('INSERT INTO password_resets (token_hash, user_id, created_by, expires_at) VALUES (?, ?, ?, ?)', tokenHash(token), userId, createdBy, expiresAt);
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

/** The account behind a link that is still valid, or undefined. */
export const findReset = (token) =>
  get(
    `SELECT r.user_id, u.email, u.name, u.totp_enabled FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = ? AND r.expires_at > ?`,
    tokenHash(token),
    Date.now(),
  );

/** Once the password changed (by link or by the person), no older link may be used. */
export const dropResets = (userId) => run('DELETE FROM password_resets WHERE user_id = ?', userId);
