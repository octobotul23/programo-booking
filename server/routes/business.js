import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import crypto from 'node:crypto';
import { requireUser } from '../auth.js';
import { BUSINESS_TYPES, PALETTE } from '../presets.js';
import {
  accessFor,
  buildAppointment,
  businessesFor,
  cleanHours,
  cleanSettings,
  createBusiness,
  findConflicts,
  findOrCreatePatient,
  getSlots,
  insertAppointment,
  isColor,
  listCalendars,
  listServices,
  notify,
  patientScopeSql,
  resolveDuration,
  toAppointment,
  toBusiness,
  toCalendar,
  toMember,
  toService,
  uniqueSlug,
} from '../model.js';
import { DATE_RE, DT_RE, addDays } from '../time.js';
import { audit, auditFor, hit } from '../security.js';
import { newReset } from '../resets.js';
import { fail, int, isEmail, parseJSON, str } from '../util.js';
import clinicRoutes from './clinic.js';

const r = Router();
r.use(requireUser, (req, _res, next) => {
  if (req.user.role === 'client') fail(403, 'wrong_account_type');
  next();
});

// Every /:bid route needs the owner or a team member of that business.
// req.access.calendarIds lists what a staff member may see (null = everything).
r.param('bid', (req, _res, next, bid) => {
  const biz = toBusiness(get('SELECT * FROM businesses WHERE id = ?', int(bid, 0, Number.MAX_SAFE_INTEGER, 0)));
  const access = biz && accessFor(req.user, biz);
  if (!access) fail(404, 'business_not_found');
  req.biz = biz;
  req.access = access;
  next();
});

/** Settings, calendars, services and the team are the owner's alone. */
const ownerOnly = (req, _res, next) => {
  if (req.access.role !== 'owner') fail(403, 'owner_only');
  next();
};
/** Patients this user may open (see patientScopeSql). */
const patientScope = (req, alias = 'p') => patientScopeSql(req.access, req.user.id, alias);
const canSee = (req, calendarId) => req.access.calendarIds === null || req.access.calendarIds.includes(Number(calendarId));
/** SQL condition limiting rows to the calendars this user may see, plus its parameters. */
const calendarScope = (req) =>
  req.access.calendarIds === null ? ['1 = 1', []] : [`calendar_id IN (${req.access.calendarIds.map(() => '?').join(',') || 'NULL'})`, req.access.calendarIds];

const full = (biz, access) => ({
  ...biz,
  calendars: listCalendars(biz.id).filter((c) => access.calendarIds === null || access.calendarIds.includes(c.id)),
  services: listServices(biz.id),
  me: access,
});

/* ───────── businesses ───────── */

r.get('/', (req, res) => res.json(businessesFor(req.user)));

r.post('/', (req, res) => {
  if (req.user.role !== 'business') fail(403, 'owner_only');
  const name = str(req.body.name, 120);
  if (!name) fail(400, 'name_required');
  const type = BUSINESS_TYPES.includes(req.body.type) ? req.body.type : 'other';
  const id = createBusiness(req.user.id, {
    name,
    type,
    lang: req.body.lang ?? req.user.lang,
    calendars: req.body.calendars,
    bookingMode: req.body.bookingMode,
    requireApproval: req.body.requireApproval,
  });
  res.status(201).json(full(toBusiness(get('SELECT * FROM businesses WHERE id = ?', id)), { role: 'owner', access: 'all', calendarIds: null }));
});

r.get('/:bid', (req, res) => res.json(full(req.biz, req.access)));

r.patch('/:bid', ownerOnly, (req, res) => {
  const b = req.biz;
  const body = req.body;
  const name = 'name' in body ? str(body.name, 120) || b.name : b.name;
  const type = BUSINESS_TYPES.includes(body.type) ? body.type : b.type;
  let slug = b.slug;
  if ('slug' in body && str(body.slug, 60) && str(body.slug, 60) !== b.slug) slug = uniqueSlug(str(body.slug, 60), b.id);
  const text = (k, max) => (k in body ? str(body[k], max) : b[k]);
  const settings = body.settings ? cleanSettings(b.settings, body.settings) : b.settings;
  run(
    'UPDATE businesses SET name=?, type=?, slug=?, description=?, phone=?, email=?, address=?, settings=? WHERE id=?',
    name,
    type,
    slug,
    text('description', 2000),
    text('phone', 40),
    text('email', 160),
    text('address', 300),
    JSON.stringify(settings),
    b.id,
  );
  audit(req, 'business_updated', { businessId: b.id, detail: { fields: Object.keys(body).filter((k) => k !== 'settings').concat(body.settings ? Object.keys(body.settings).map((k) => `settings.${k}`) : []) } });
  res.json(full(toBusiness(get('SELECT * FROM businesses WHERE id = ?', b.id)), req.access));
});

r.delete('/:bid', ownerOnly, (req, res) => {
  run('DELETE FROM businesses WHERE id = ?', req.biz.id);
  audit(req, 'business_deleted', { detail: { id: req.biz.id, name: req.biz.name } });
  res.json({ ok: true });
});

/* ───────── calendars ("sheets": one per doctor / trainer / room) ───────── */

function calendarValues(body, current = {}) {
  const has = (k) => k in body;
  return {
    name: has('name') ? str(body.name, 80) || current.name : current.name,
    description: has('description') ? str(body.description, 500) : current.description ?? '',
    color: has('color') && isColor(body.color) ? body.color : current.color,
    capacity: has('capacity') ? int(body.capacity, 1, 500, 1) : current.capacity ?? 1,
    defaultDuration: has('defaultDuration') ? int(body.defaultDuration, 5, 720, null) : current.defaultDuration ?? null,
    hours: has('hours') ? cleanHours(body.hours) : current.hours,
    active: has('active') ? !!body.active : current.active ?? true,
  };
}

r.post('/:bid/calendars', ownerOnly, (req, res) => {
  const existing = listCalendars(req.biz.id);
  const template = existing[0];
  const v = calendarValues(req.body, {
    name: 'Calendar',
    color: PALETTE[existing.length % PALETTE.length],
    hours: template?.hours ?? cleanHours({}),
  });
  const { lastInsertRowid } = run(
    'INSERT INTO calendars (business_id, name, description, color, capacity, default_duration, hours, position, active) VALUES (?,?,?,?,?,?,?,?,?)',
    req.biz.id,
    v.name,
    v.description,
    v.color,
    v.capacity,
    v.defaultDuration,
    JSON.stringify(v.hours),
    existing.length,
    v.active,
  );
  res.status(201).json(toCalendar(get('SELECT * FROM calendars WHERE id = ?', lastInsertRowid)));
});

function forgetCalendar(bizId, calendarId) {
  for (const table of ['members', 'services']) {
    for (const row of all(`SELECT id, calendar_ids FROM ${table} WHERE business_id = ?`, bizId)) {
      const ids = parseJSON(row.calendar_ids, []);
      if (ids.includes(calendarId)) run(`UPDATE ${table} SET calendar_ids = ? WHERE id = ?`, JSON.stringify(ids.filter((x) => x !== calendarId)), row.id);
    }
  }
}

const ownCalendar = (req) => {
  const c = toCalendar(get('SELECT * FROM calendars WHERE id = ? AND business_id = ?', req.params.cid, req.biz.id));
  if (!c) fail(404, 'calendar_not_found');
  return c;
};

r.patch('/:bid/calendars/:cid', ownerOnly, (req, res) => {
  const c = ownCalendar(req);
  const v = calendarValues(req.body, c);
  run(
    'UPDATE calendars SET name=?, description=?, color=?, capacity=?, default_duration=?, hours=?, active=? WHERE id=?',
    v.name,
    v.description,
    v.color,
    v.capacity,
    v.defaultDuration,
    JSON.stringify(v.hours),
    v.active,
    c.id,
  );
  res.json(toCalendar(get('SELECT * FROM calendars WHERE id = ?', c.id)));
});

r.post('/:bid/calendars/reorder', ownerOnly, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  tx(() => ids.forEach((id, i) => run('UPDATE calendars SET position = ? WHERE id = ? AND business_id = ?', i, id, req.biz.id)));
  res.json(listCalendars(req.biz.id));
});

r.delete('/:bid/calendars/:cid', ownerOnly, (req, res) => {
  const c = ownCalendar(req);
  if (listCalendars(req.biz.id).length <= 1) fail(400, 'last_calendar');
  tx(() => {
    run('DELETE FROM calendars WHERE id = ?', c.id);
    // SQLite hands a deleted id to the next new calendar: a doctor still listed for this one
    // would quietly get someone else's calendar. Forget it everywhere.
    forgetCalendar(req.biz.id, c.id);
  });
  audit(req, 'calendar_deleted', { businessId: req.biz.id, detail: { name: c.name } });
  res.json({ ok: true });
});

/* ───────── services ───────── */

function serviceValues(req, current = {}) {
  const body = req.body;
  const has = (k) => k in body;
  const valid = new Set(listCalendars(req.biz.id).map((c) => c.id));
  const price = has('price') ? (body.price === '' || body.price === null ? null : Number(body.price)) : current.price ?? null;
  return {
    name: has('name') ? str(body.name, 120) || current.name : current.name,
    description: has('description') ? str(body.description, 1000) : current.description ?? '',
    duration: has('duration') ? int(body.duration, 5, 1440, 30) : current.duration ?? 30,
    price: Number.isFinite(price) ? price : null,
    color: has('color') ? (isColor(body.color) ? body.color : '') : current.color ?? '',
    calendarIds: has('calendarIds') && Array.isArray(body.calendarIds) ? [...new Set(body.calendarIds.map(Number))].filter((id) => valid.has(id)) : current.calendarIds ?? [],
    active: has('active') ? !!body.active : current.active ?? true,
  };
}

r.post('/:bid/services', ownerOnly, (req, res) => {
  const v = serviceValues(req, { name: 'Service' });
  const pos = get('SELECT COUNT(*) n FROM services WHERE business_id = ?', req.biz.id).n;
  const { lastInsertRowid } = run(
    'INSERT INTO services (business_id, name, description, duration, price, color, calendar_ids, position, active) VALUES (?,?,?,?,?,?,?,?,?)',
    req.biz.id,
    v.name,
    v.description,
    v.duration,
    v.price,
    v.color,
    JSON.stringify(v.calendarIds),
    pos,
    v.active,
  );
  res.status(201).json(toService(get('SELECT * FROM services WHERE id = ?', lastInsertRowid)));
});

r.patch('/:bid/services/:sid', ownerOnly, (req, res) => {
  const s = toService(get('SELECT * FROM services WHERE id = ? AND business_id = ?', req.params.sid, req.biz.id));
  if (!s) fail(404, 'service_not_found');
  const v = serviceValues(req, s);
  run(
    'UPDATE services SET name=?, description=?, duration=?, price=?, color=?, calendar_ids=?, active=? WHERE id=?',
    v.name,
    v.description,
    v.duration,
    v.price,
    v.color,
    JSON.stringify(v.calendarIds),
    v.active,
    s.id,
  );
  res.json(toService(get('SELECT * FROM services WHERE id = ?', s.id)));
});

r.delete('/:bid/services/:sid', ownerOnly, (req, res) => {
  run('DELETE FROM services WHERE id = ? AND business_id = ?', req.params.sid, req.biz.id);
  res.json({ ok: true });
});

/* ───────── time off / closures ───────── */

const toTimeOff = (t) => ({ id: t.id, calendarId: t.calendar_id, start: t.start_at, end: t.end_at, reason: t.reason });

r.get('/:bid/timeoff', (req, res) => {
  const from = DT_RE.test(req.query.from) ? req.query.from : '0000';
  const to = DT_RE.test(req.query.to) ? req.query.to : '9999';
  const [scope, ids] = calendarScope(req);
  res.json(
    all(
      `SELECT * FROM time_off WHERE business_id = ? AND start_at < ? AND end_at > ? AND (calendar_id IS NULL OR ${scope}) ORDER BY start_at`,
      req.biz.id,
      to,
      from,
      ...ids,
    ).map(toTimeOff),
  );
});

r.post('/:bid/timeoff', (req, res) => {
  const { start, end } = req.body;
  if (!DT_RE.test(start || '') || !DT_RE.test(end || '') || end <= start) fail(400, 'invalid_datetime');
  let calendarId = null;
  if (req.body.calendarId) {
    calendarId = get('SELECT id FROM calendars WHERE id = ? AND business_id = ?', req.body.calendarId, req.biz.id)?.id;
    if (!calendarId || !canSee(req, calendarId)) fail(400, 'invalid_calendar');
  } else if (req.access.role !== 'owner') fail(403, 'owner_only');
  const { lastInsertRowid } = run(
    'INSERT INTO time_off (business_id, calendar_id, start_at, end_at, reason) VALUES (?,?,?,?,?)',
    req.biz.id,
    calendarId,
    start,
    end,
    str(req.body.reason, 200),
  );
  res.status(201).json(toTimeOff(get('SELECT * FROM time_off WHERE id = ?', lastInsertRowid)));
});

r.delete('/:bid/timeoff/:tid', (req, res) => {
  const t = get('SELECT * FROM time_off WHERE id = ? AND business_id = ?', req.params.tid, req.biz.id);
  if (t && (t.calendar_id === null ? req.access.role !== 'owner' : !canSee(req, t.calendar_id))) fail(403, 'owner_only');
  run('DELETE FROM time_off WHERE id = ? AND business_id = ?', req.params.tid, req.biz.id);
  res.json({ ok: true });
});

/* ───────── appointments ───────── */

r.get('/:bid/appointments', (req, res) => {
  const [scope, ids] = calendarScope(req);
  const where = ['business_id = ?', scope];
  const params = [req.biz.id, ...ids];
  if (DATE_RE.test(req.query.from || '')) where.push('start_at >= ?') && params.push(`${req.query.from}T00:00`);
  if (DATE_RE.test(req.query.to || '')) where.push('start_at < ?') && params.push(`${addDays(req.query.to, 1)}T00:00`);
  if (req.query.calendarId) where.push('calendar_id = ?') && params.push(Number(req.query.calendarId));
  if (req.query.status) where.push('status = ?') && params.push(String(req.query.status));
  if (req.query.q) {
    const q = `%${String(req.query.q).trim()}%`;
    where.push('(client_name LIKE ? OR client_email LIKE ? OR client_phone LIKE ? OR notes LIKE ?)');
    params.push(q, q, q, q);
  }
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const limit = int(req.query.limit, 1, 5000, 2000);
  res.json(all(`SELECT * FROM appointments WHERE ${where.join(' AND ')} ORDER BY start_at ${order} LIMIT ${limit}`, ...params).map(toAppointment));
});

r.post('/:bid/appointments', (req, res) => {
  const { calendar, values } = buildAppointment(req.biz, req.body, { isStaff: true, patientScope: patientScope(req) });
  if (!canSee(req, calendar.id)) fail(400, 'invalid_calendar');
  const conflict = findConflicts(req.biz, calendar, values.start_at, values.end_at);
  if ((conflict.full || conflict.timeOff) && !req.body.force) fail(409, 'conflict', conflict);
  const appt = insertAppointment(req.biz, values, { source: 'staff', createdBy: req.user.id, patientScope: patientScope(req) });
  notify(req.biz, { calendarId: appt.calendarId, appointmentId: appt.id, kind: 'booked', actorId: req.user.id, data: { clientName: appt.clientName, start: appt.start } });
  res.status(201).json(appt);
});

const ownAppointment = (req) => {
  const a = toAppointment(get('SELECT * FROM appointments WHERE id = ? AND business_id = ?', req.params.aid, req.biz.id));
  if (!a || !canSee(req, a.calendarId)) fail(404, 'appointment_not_found');
  return a;
};

r.patch('/:bid/appointments/:aid', (req, res) => {
  const existing = ownAppointment(req);
  const { calendar, values } = buildAppointment(req.biz, req.body, { isStaff: true, existing, patientScope: patientScope(req) });
  if (!canSee(req, calendar.id)) fail(400, 'invalid_calendar');
  const moved = values.start_at !== existing.start || values.end_at !== existing.end || values.calendar_id !== existing.calendarId;
  // every status except "cancelled" keeps its time slot taken
  const reactivated = existing.status === 'cancelled' && values.status !== 'cancelled';
  if ((moved || reactivated) && values.status !== 'cancelled' && !req.body.force) {
    const conflict = findConflicts(req.biz, calendar, values.start_at, values.end_at, existing.id);
    if (conflict.full || conflict.timeOff) fail(409, 'conflict', conflict);
  }
  run(
    `UPDATE appointments SET calendar_id=?, service_id=?, client_name=?, client_email=?, client_phone=?, start_at=?, end_at=?,
     status=?, notes=?, custom=?, patient_id=?, price=? WHERE id=?`,
    values.calendar_id,
    values.service_id,
    values.client_name,
    values.client_email,
    values.client_phone,
    values.start_at,
    values.end_at,
    values.status,
    values.notes,
    values.custom,
    values.patient_id ?? findOrCreatePatient(req.biz, { name: values.client_name, phone: values.client_phone, email: values.client_email }, req.user.id, { scope: patientScope(req) }),
    values.price,
    existing.id,
  );
  const updated = toAppointment(get('SELECT * FROM appointments WHERE id = ?', existing.id));
  const kind = values.status === 'cancelled' && existing.status !== 'cancelled' ? 'cancelled' : moved ? 'rescheduled' : null;
  if (kind)
    notify(req.biz, {
      calendarId: updated.calendarId,
      appointmentId: updated.id,
      kind,
      actorId: req.user.id,
      data: { clientName: updated.clientName, start: updated.start, from: moved ? existing.start : undefined },
    });
  res.json(updated);
});

r.delete('/:bid/appointments/:aid', (req, res) => {
  const a = ownAppointment(req);
  run('DELETE FROM appointments WHERE id = ?', a.id);
  res.json({ ok: true });
});

/* ───────── availability (staff view: no notice / horizon limits) ───────── */

r.get('/:bid/availability', (req, res) => {
  const calendar = toCalendar(get('SELECT * FROM calendars WHERE id = ? AND business_id = ?', req.query.calendarId, req.biz.id));
  if (!calendar || !canSee(req, calendar.id)) fail(400, 'invalid_calendar');
  if (!DATE_RE.test(req.query.date || '')) fail(400, 'invalid_datetime');
  const service = req.query.serviceId ? toService(get('SELECT * FROM services WHERE id = ? AND business_id = ?', req.query.serviceId, req.biz.id)) : null;
  res.json(getSlots(req.biz, calendar, req.query.date, resolveDuration(req.biz, calendar, service), { forClient: false }));
});

/* ───────── clients (derived from bookings) ───────── */

r.get('/:bid/clients', (req, res) => {
  const [scope, ids] = calendarScope(req);
  const rows = all(
    `SELECT client_name AS name, MAX(client_email) AS email, MAX(client_phone) AS phone, MAX(client_id) AS userId,
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS noShows,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
       MIN(start_at) AS firstVisit, MAX(start_at) AS lastVisit
     FROM appointments WHERE business_id = ? AND ${scope}
     GROUP BY lower(COALESCE(NULLIF(client_email, ''), NULLIF(client_phone, ''), client_name))
     ORDER BY lastVisit DESC`,
    req.biz.id,
    ...ids,
  );
  res.json(rows);
});

/* ───────── team (staff logins) ───────── */

const newToken = () => crypto.randomBytes(24).toString('base64url');

function memberValues(req, current = {}) {
  const b = req.body;
  const valid = new Set(listCalendars(req.biz.id).map((c) => c.id));
  return {
    name: 'name' in b ? str(b.name, 120) || current.name : current.name,
    access: b.access === 'all' || b.access === 'own' ? b.access : current.access ?? 'own',
    calendarIds: Array.isArray(b.calendarIds) ? [...new Set(b.calendarIds.map(Number))].filter((id) => valid.has(id)) : current.calendarIds ?? [],
  };
}

const ownMember = (req) => {
  const m = toMember(get('SELECT * FROM members WHERE id = ? AND business_id = ?', req.params.mid, req.biz.id));
  if (!m) fail(404, 'member_not_found');
  return m;
};

r.get('/:bid/members', ownerOnly, (req, res) => {
  res.json(all('SELECT * FROM members WHERE business_id = ? ORDER BY name', req.biz.id).map(toMember));
});

r.post('/:bid/members', ownerOnly, (req, res) => {
  const email = str(req.body.email, 160).toLowerCase();
  if (!isEmail(email)) fail(400, 'invalid_email');
  const v = memberValues(req);
  if (!v.name) fail(400, 'name_required');
  if (get('SELECT 1 FROM members WHERE business_id = ? AND email = ?', req.biz.id, email)) fail(409, 'member_exists');
  // whether this email already has an account is not checked here: any owner could use that to
  // probe who uses Programo. The invite page tells the invited person instead.
  const { lastInsertRowid } = run(
    'INSERT INTO members (business_id, name, email, access, calendar_ids, invite_token) VALUES (?,?,?,?,?,?)',
    req.biz.id,
    v.name,
    email,
    v.access,
    JSON.stringify(v.calendarIds),
    newToken(),
  );
  audit(req, 'member_added', { businessId: req.biz.id, detail: { name: v.name, email, access: v.access } });
  res.status(201).json(toMember(get('SELECT * FROM members WHERE id = ?', lastInsertRowid)));
});

r.patch('/:bid/members/:mid', ownerOnly, (req, res) => {
  const m = ownMember(req);
  const v = memberValues(req, m);
  run('UPDATE members SET name = ?, access = ?, calendar_ids = ? WHERE id = ?', v.name, v.access, JSON.stringify(v.calendarIds), m.id);
  if (v.access !== m.access || JSON.stringify(v.calendarIds) !== JSON.stringify(m.calendarIds))
    audit(req, 'member_access', { businessId: req.biz.id, detail: { name: v.name, access: v.access, calendars: v.calendarIds.length } });
  res.json(toMember(get('SELECT * FROM members WHERE id = ?', m.id)));
});

/** A fresh invite link; the old one stops working. */
r.post('/:bid/members/:mid/invite', ownerOnly, (req, res) => {
  const m = ownMember(req);
  if (m.status !== 'invited') fail(400, 'already_joined');
  run('UPDATE members SET invite_token = ? WHERE id = ?', newToken(), m.id);
  res.json(toMember(get('SELECT * FROM members WHERE id = ?', m.id)));
});

/** A one-time link for a team member who forgot their password (the app sends no email). */
r.post('/:bid/members/:mid/reset', ownerOnly, (req, res) => {
  const m = ownMember(req);
  if (!m.userId) fail(400, 'not_joined');
  hit(`reset-link:${req.user.id}`, 20, 60 * 60_000, req);
  const u = get('SELECT id, role FROM users WHERE id = ?', m.userId);
  // only for a login that works in nowhere but this owner's businesses: otherwise one owner
  // could take over a person who also works for someone else
  const elsewhere = get('SELECT 1 FROM members mm JOIN businesses b ON b.id = mm.business_id WHERE mm.user_id = ? AND b.owner_id != ?', m.userId, req.user.id);
  if (u?.role !== 'staff' || elsewhere) fail(403, 'reset_not_allowed');
  const link = newReset(u.id, req.user.id);
  audit(req, 'reset_link', { businessId: req.biz.id, detail: { name: m.name } });
  res.json(link);
});

r.delete('/:bid/members/:mid', ownerOnly, (req, res) => {
  const m = ownMember(req);
  tx(() => {
    run('DELETE FROM members WHERE id = ?', m.id);
    // a staff login exists only to work somewhere, so it goes with its last workplace
    if (m.userId && !get('SELECT 1 FROM members WHERE user_id = ?', m.userId)) run("DELETE FROM users WHERE id = ? AND role = 'staff'", m.userId);
    // their logins end with them
    if (m.userId) run('DELETE FROM sessions WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM members WHERE user_id = ?)', m.userId, m.userId);
  });
  audit(req, 'member_removed', { businessId: req.biz.id, detail: { name: m.name, email: m.email } });
  res.json({ ok: true });
});

/* ───────── activity log (owner) ───────── */

r.get('/:bid/audit', ownerOnly, (req, res) => {
  const team = [req.biz.ownerId, ...all('SELECT user_id FROM members WHERE business_id = ? AND user_id IS NOT NULL', req.biz.id).map((m) => m.user_id)];
  res.json(auditFor(req.biz.id, team, { limit: int(req.query.limit, 1, 200, 100), before: int(req.query.before, 0, Number.MAX_SAFE_INTEGER, 0) }));
});

clinicRoutes(r, { ownerOnly, canSee, calendarScope });

export default r;
