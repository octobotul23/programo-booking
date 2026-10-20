// For whoever runs the server: prints a one-time link to set a new password for any account,
// an owner's included (the app sends no email, so this is the "forgot password" of last resort).
//
//   npm run reset-link -- someone@example.com
//   npm run reset-link -- someone@example.com --url https://programo.example.com
//   npm run reset-link -- someone@example.com --no-2fa     (also turns off two-step login: lost phone)
//
// Run it from the server's folder: it reads .env there (PUBLIC_URL for the link, APP_SECRET) and needs the same
// DATA_DIR as the running server, or it stops.
import './cli.js'; // first: finds the server's database, or stops
import { get, run } from './db.js';
import { audit } from './security.js';
import { RESET_HOURS, newReset } from './resets.js';

const args = process.argv.slice(2);
const email = args.find((a) => a.includes('@'))?.toLowerCase();
const urlAt = args.indexOf('--url');
const base = (urlAt >= 0 ? args[urlAt + 1] : process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');

if (!email) {
  console.error('Usage: npm run reset-link -- someone@example.com [--url https://your.domain] [--no-2fa]');
  process.exit(1);
}
const user = get('SELECT id, name, role, totp_enabled FROM users WHERE email = ?', email);
if (!user) {
  console.error(`No account with the email ${email}.`);
  process.exit(1);
}

if (args.includes('--no-2fa') && user.totp_enabled) {
  run("UPDATE users SET totp_enabled = 0, totp_secret = '', totp_last = 0, totp_backup = '[]' WHERE id = ?", user.id);
  audit(null, '2fa_disabled', { userId: user.id, detail: { by: 'server' } });
  console.log('Two-step login turned off for this account.');
}
const { token } = newReset(user.id);
audit(null, 'reset_link', { userId: user.id, detail: { name: user.name, by: 'server' } });

console.log(`\nPassword reset link for ${user.name} (${user.role}), valid ${RESET_HOURS} hours, works once:\n\n  ${base}/reset/${token}\n`);
