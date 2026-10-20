import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// business = owner, staff = invited team member (doctor, trainer, receptionist), client = books appointments
const usersTable = (name) => `CREATE TABLE IF NOT EXISTS ${name} (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL CHECK (role IN ('business', 'staff', 'client')),
  lang          TEXT NOT NULL DEFAULT 'en',
  theme         TEXT NOT NULL DEFAULT 'light',
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`;

// Databases created before staff accounts existed have a CHECK without 'staff'.
// SQLite cannot alter a CHECK, so rebuild the table (the documented 12-step way).
const oldUsers = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
if (oldUsers && !oldUsers.sql.includes("'staff'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`BEGIN;
    ${usersTable('users_new')}
    INSERT INTO users_new (id, email, password_hash, name, phone, role, lang, created_at)
      SELECT id, email, password_hash, name, phone, role, lang, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    COMMIT;`);
  db.exec('PRAGMA foreign_keys = ON');
}
db.exec(usersTable('users'));

db.exec(`

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS businesses (
  id          INTEGER PRIMARY KEY,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  settings    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A calendar is one bookable column: a doctor, a trainer, a room, a class...
CREATE TABLE IF NOT EXISTS calendars (
  id               INTEGER PRIMARY KEY,
  business_id      INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  color            TEXT NOT NULL DEFAULT '#c9a96e',
  capacity         INTEGER NOT NULL DEFAULT 1,
  default_duration INTEGER,
  hours            TEXT NOT NULL DEFAULT '{}',
  position         INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS services (
  id           INTEGER PRIMARY KEY,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  duration     INTEGER NOT NULL DEFAULT 30,
  price        REAL,
  color        TEXT NOT NULL DEFAULT '',
  calendar_ids TEXT NOT NULL DEFAULT '[]',
  position     INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS time_off (
  id          INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  calendar_id INTEGER REFERENCES calendars(id) ON DELETE CASCADE, -- NULL = whole business closed
  start_at    TEXT NOT NULL,
  end_at      TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS appointments (
  id           INTEGER PRIMARY KEY,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  calendar_id  INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  service_id   INTEGER REFERENCES services(id) ON DELETE SET NULL,
  client_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  client_name  TEXT NOT NULL,
  client_email TEXT NOT NULL DEFAULT '',
  client_phone TEXT NOT NULL DEFAULT '',
  start_at     TEXT NOT NULL, -- local business time, 'YYYY-MM-DDTHH:MM'
  end_at       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'confirmed'
               CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  notes        TEXT NOT NULL DEFAULT '',
  custom       TEXT NOT NULL DEFAULT '{}',
  source       TEXT NOT NULL DEFAULT 'staff',
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Team members: a staff login that sees some (or all) of a business's calendars.
-- user_id stays NULL until the invite link is used.
CREATE TABLE IF NOT EXISTS members (
  id           INTEGER PRIMARY KEY,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL COLLATE NOCASE,
  access       TEXT NOT NULL DEFAULT 'own' CHECK (access IN ('own', 'all')),
  calendar_ids TEXT NOT NULL DEFAULT '[]',
  invite_token TEXT UNIQUE,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (business_id, email)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);

-- Partner companies (insurers, corporate contracts) with a default discount
CREATE TABLE IF NOT EXISTS companies (
  id          INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  tax_id      TEXT NOT NULL DEFAULT '',
  contact     TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  discount    REAL NOT NULL DEFAULT 0, -- percent off service prices
  notes       TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per patient / client of a business: the patient file ("dosar")
CREATE TABLE IF NOT EXISTS patients (
  id          INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  company_id  INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL, -- their client login, if any
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  birth_date  TEXT NOT NULL DEFAULT '',
  gender      TEXT NOT NULL DEFAULT '',
  id_number   TEXT NOT NULL DEFAULT '', -- CNP in Romania
  address     TEXT NOT NULL DEFAULT '',
  medical     TEXT NOT NULL DEFAULT '', -- allergies, conditions: shown as an alert
  notes       TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT '', -- how they found the business
  consent     INTEGER NOT NULL DEFAULT 1, -- agrees to SMS / WhatsApp messages
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL -- local business time 'YYYY-MM-DDTHH:MM'
);
CREATE INDEX IF NOT EXISTS idx_patients_biz ON patients(business_id, name);
CREATE INDEX IF NOT EXISTS idx_patients_company ON patients(company_id);

-- Money received (negative amount = refund)
CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY,
  business_id    INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  patient_id     INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  amount         REAL NOT NULL,
  method         TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'card', 'transfer', 'other')),
  note           TEXT NOT NULL DEFAULT '',
  paid_at        TEXT NOT NULL, -- local business time
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_biz ON payments(business_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id);
-- what was paid for each booking (unpaid list, dashboard, a patient's file): without it every booking scans all payments
CREATE INDEX IF NOT EXISTS idx_payments_appt ON payments(appointment_id);

-- Entries in a patient's file: visit notes, diagnoses, treatments...
CREATE TABLE IF NOT EXISTS records (
  id             INTEGER PRIMARY KEY,
  business_id    INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  patient_id     INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  calendar_id    INTEGER REFERENCES calendars(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'diagnosis', 'treatment', 'prescription', 'recommendation')),
  title          TEXT NOT NULL DEFAULT '',
  body           TEXT NOT NULL DEFAULT '',
  author_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name    TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL -- local business time
);
CREATE INDEX IF NOT EXISTS idx_records_patient ON records(patient_id, created_at);

-- What happened that the team should know about (new online booking, cancellation...)
CREATE TABLE IF NOT EXISTS notifications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT, -- never reused: "seen up to id N" must stay true
  business_id    INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  calendar_id    INTEGER REFERENCES calendars(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL,
  data           TEXT NOT NULL DEFAULT '{}',
  actor_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL -- local business time
);
CREATE INDEX IF NOT EXISTS idx_notifications_biz ON notifications(business_id, id);
CREATE TABLE IF NOT EXISTS notification_seen (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  last_id     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, business_id)
);

-- SMS / WhatsApp to patients (automatically through a provider, or by hand through a link)
CREATE TABLE IF NOT EXISTS messages (
  id             INTEGER PRIMARY KEY,
  business_id    INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  patient_id     INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  channel        TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
  kind           TEXT NOT NULL DEFAULT 'custom', -- reminder, confirmation, custom
  to_phone       TEXT NOT NULL,
  body           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'manual' CHECK (status IN ('manual', 'sent', 'failed')),
  error          TEXT NOT NULL DEFAULT '',
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL -- local business time
);
CREATE INDEX IF NOT EXISTS idx_messages_biz ON messages(business_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_appt ON messages(appointment_id, kind);

-- Provider keys (Twilio...). Kept out of business.settings so they never reach the browser.
CREATE TABLE IF NOT EXISTS integrations (
  business_id INTEGER PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  data        TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_appt_cal_start ON appointments(calendar_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appt_biz_start ON appointments(business_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appt_client ON appointments(client_id);
`);

// Unread counts are "ids above the last one I saw". Without AUTOINCREMENT, deleting the newest
// notifications (a calendar removed) hands their ids out again and those new ones count as seen.
const notifSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notifications'").get().sql;
if (!notifSql.includes('AUTOINCREMENT')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`BEGIN;
    ${notifSql.replace(/CREATE TABLE (IF NOT EXISTS )?"?notifications"?/, 'CREATE TABLE notifications_new').replace(/\bid\s+INTEGER PRIMARY KEY\b/, 'id INTEGER PRIMARY KEY AUTOINCREMENT')};
    INSERT INTO notifications_new SELECT * FROM notifications;
    DROP TABLE notifications;
    ALTER TABLE notifications_new RENAME TO notifications;
    CREATE INDEX IF NOT EXISTS idx_notifications_biz ON notifications(business_id, id);
    DELETE FROM sqlite_sequence WHERE name = 'notifications';
    INSERT INTO sqlite_sequence (name, seq) SELECT 'notifications', MAX(
      COALESCE((SELECT MAX(id) FROM notifications), 0), COALESCE((SELECT MAX(last_id) FROM notification_seen), 0));
    COMMIT;`);
  db.exec('PRAGMA foreign_keys = ON');
}

// Columns added after the first release
const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
if (!hasColumn('users', 'theme')) db.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'");
if (!hasColumn('appointments', 'patient_id')) {
  db.exec('ALTER TABLE appointments ADD COLUMN patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL');
  db.exec('ALTER TABLE appointments ADD COLUMN price REAL');
  // existing bookings take their service's price
  db.exec('UPDATE appointments SET price = (SELECT price FROM services s WHERE s.id = appointments.service_id) WHERE service_id IS NOT NULL');
}
if (!hasColumn('patients', 'phone_key')) db.exec("ALTER TABLE patients ADD COLUMN phone_key TEXT NOT NULL DEFAULT ''");
db.exec('CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id)');

// Security: two-factor login, session details (devices list), audit trail
if (!hasColumn('users', 'totp_secret')) {
  db.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN totp_last INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN totp_backup TEXT NOT NULL DEFAULT '[]';`);
}
if (!hasColumn('sessions', 'created_at')) {
  // tokens are stored hashed from now on: older raw tokens cannot be matched, so they go
  db.exec(`DELETE FROM sessions;
    ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN ip TEXT NOT NULL DEFAULT '';
    ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY,
  business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '{}',
  ip          TEXT NOT NULL DEFAULT '',
  user_agent  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL -- UTC ISO time
);
CREATE INDEX IF NOT EXISTS idx_audit_biz ON audit_log(business_id, id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, id);`);
db.exec('CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(business_id, phone_key)');
// one-time links to set a new password (stored hashed, like sessions)
db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at INTEGER NOT NULL
)`);

// node:sqlite rejects `undefined` and booleans, so normalise every bound value here
const norm = (params) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export const get = (sql, ...p) => db.prepare(sql).get(...norm(p));
export const all = (sql, ...p) => db.prepare(sql).all(...norm(p));
export const run = (sql, ...p) => db.prepare(sql).run(...norm(p));

// Nestable: the outermost call is a transaction, inner calls are savepoints
let depth = 0;
export function tx(fn) {
  const sp = `sp${depth}`;
  db.exec(depth ? `SAVEPOINT ${sp}` : 'BEGIN');
  depth++;
  try {
    const result = fn();
    depth--;
    db.exec(depth ? `RELEASE ${sp}` : 'COMMIT');
    return result;
  } catch (e) {
    depth--;
    db.exec(depth ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
    throw e;
  }
}
