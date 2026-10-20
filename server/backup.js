// A consistent copy of the database, safe while the server runs: npm run backup [-- folder]
// Keeps the newest 14 copies in that folder (default: <data>/backups). Copy them off this machine too:
// a backup on the same disk does not survive the disk.
//
// Two-factor secrets and SMS tokens inside are encrypted with APP_SECRET, or the key in <data>/.secret.
// Keep that key safe and separately: without it those fields cannot be read back; with it plus a copy, they can.
import { DATA_DIR } from './cli.js'; // first: finds the server's database, or stops
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';

const KEEP = 14;
const dir = path.resolve(process.argv[2] || path.join(DATA_DIR, 'backups'));
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const file = path.join(dir, `app-${stamp}.db`);
db.prepare('VACUUM INTO ?').run(file);
fs.chmodSync(file, 0o600);

const old = fs.readdirSync(dir).filter((f) => /^app-\d{8}-\d{6}\.db$/.test(f)).sort().slice(0, -KEEP);
for (const f of old) fs.rmSync(path.join(dir, f));

const kb = Math.round(fs.statSync(file).size / 1024);
console.log(`Backup written: ${file} (${kb} KB)${old.length ? `, removed ${old.length} older` : ''}`);
if (!process.env.APP_SECRET) console.log(`Remember: the encryption key is ${path.join(DATA_DIR, '.secret')} — keep a copy of it somewhere safe, apart from the backups.`);
