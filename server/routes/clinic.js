import { all, get, run, tx } from '../db.js';
import {
  createPatient,
  patientScopeSql,
  phoneKey,
  toAppointment,
  toCompany,
  toMessage,
  toPatient,
  toPayment,
  toRecord,
} from '../model.js';
import {
  DEFAULT_TEMPLATES,
  appointmentVars,
  getIntegration,
  logMessage,
  manualLink,
  renderTemplate,
  saveIntegration,
  sendViaTwilio,
  templateFor,
  twilioReady,
} from '../messaging.js';
import { DATE_RE, DT_RE, addDays, nowIn } from '../time.js';
import { audit } from '../security.js';
import { fail, int, isEmail, parseJSON, str } from '../util.js';

/*
  Clinic features on top of the calendar: patient files, companies, cashier, dashboard,
  reports, search, notifications and SMS / WhatsApp. Mounted on the business router,
  so every route already has req.biz and req.access (see business.js).
*/
export default function clinicRoutes(r, { ownerOnly, canSee, calendarScope }) {
  const today = (req) => nowIn(req.biz.settings.timezone).slice(0, 10);
  const now = (req) => nowIn(req.biz.settings.timezone);
  /** Owner and "all calendars" staff (reception) handle money and companies. */
  const isDesk = (req) => req.access.role === 'owner' || req.access.access === 'all';
  const deskOnly = (req, _res, next) => {
    if (!isDesk(req)) fail(403, 'owner_only');
    next();
  };
  /** ?from=&to= (dates); defaults to this month up to today. */
  const range = (req) => {
    const t = today(req);
    const from = DATE_RE.test(req.query.from || '') ? req.query.from : `${t.slice(0, 8)}01`;
    const to = DATE_RE.test(req.query.to || '') && req.query.to >= from ? req.query.to : t >= from ? t : from;
    return { from, to, start: `${from}T00:00`, end: `${addDays(to, 1)}T00:00`, today: t };
  };
  /** Same as calendarScope, for a query where appointments are aliased "a". */
  const apptScope = (req, alias = 'a') => {
    const [sql, ids] = calendarScope(req);
    return [sql.replace('calendar_id', `${alias}.calendar_id`), ids];
  };
  /**
   * Patients a user may open: everyone for the owner and reception; for a doctor, the
   * patients booked in their calendars plus the ones they added themselves.
   */
  const patientScope = (req, alias = 'p') => patientScopeSql(req.access, req.user.id, alias);
  const marks = (ids) => ids.map(() => '?').join(',') || 'NULL';
  /** A doctor reads the notes written in their calendars, by them, or not tied to any calendar. */
  const recordScope = (req, alias = 'r') => {
    if (req.access.calendarIds === null) return ['1 = 1', []];
    const ids = req.access.calendarIds;
    return [`(${alias}.calendar_id IS NULL OR ${alias}.author_id = ? OR ${alias}.calendar_id IN (${marks(ids)}))`, [req.user.id, ...ids]];
  };
  /** ...and the messages they sent or that are about bookings in their calendars. */
  const messageScope = (req, alias = 'm') => {
    if (req.access.calendarIds === null) return ['1 = 1', []];
    const ids = req.access.calendarIds;
    return [
      `(${alias}.created_by = ? OR ${alias}.appointment_id IN (SELECT id FROM appointments WHERE business_id = ? AND calendar_id IN (${marks(ids)})))`,
      [req.user.id, req.biz.id, ...ids],
    ];
  };
  /** Partner companies: the desk sees everything, doctors only which company a patient belongs to. */
  const companyView = (req, c) => (!c ? null : isDesk(req) ? c : { id: c.id, name: c.name, active: c.active });
  /** Payments a user may see: all for the desk; for a doctor, payments for their own bookings. */
  const paymentScope = (req, alias = 'pay') => {
    if (req.access.calendarIds === null) return ['1 = 1', []];
    const ids = req.access.calendarIds;
    return [
      `${alias}.appointment_id IN (SELECT id FROM appointments WHERE calendar_id IN (${ids.map(() => '?').join(',') || 'NULL'}))`,
      ids,
    ];
  };

  const ownPatient = (req, id = req.params.pid) => {
    const [scope, params] = patientScope(req);
    const p = toPatient(get(`SELECT * FROM patients p WHERE p.id = ? AND p.business_id = ? AND ${scope}`, id, req.biz.id, ...params));
    if (!p) fail(404, 'patient_not_found');
    return p;
  };

  function patientValues(req, current = {}) {
    const b = req.body;
    const has = (k) => k in b;
    const text = (k, max) => (has(k) ? str(b[k], max) : current[k] ?? '');
    const v = {
      name: has('name') ? str(b.name, 120) || current.name : current.name,
      phone: text('phone', 40),
      email: text('email', 160),
      birthDate: has('birthDate') ? (DATE_RE.test(b.birthDate || '') ? b.birthDate : '') : current.birthDate ?? '',
      gender: has('gender') ? (['f', 'm'].includes(b.gender) ? b.gender : '') : current.gender ?? '',
      idNumber: text('idNumber', 20),
      address: text('address', 300),
      medical: text('medical', 2000),
      notes: text('notes', 4000),
      source: text('source', 80),
      consent: has('consent') ? !!b.consent : current.consent ?? true,
      companyId: has('companyId') ? (b.companyId ? int(b.companyId, 1, Number.MAX_SAFE_INTEGER, null) : null) : current.companyId ?? null,
    };
    if (!v.name) fail(400, 'name_required');
    if (v.email && !isEmail(v.email)) fail(400, 'invalid_email');
    if (v.companyId && !get('SELECT 1 FROM companies WHERE id = ? AND business_id = ?', v.companyId, req.biz.id)) fail(400, 'company_not_found');
    return v;
  }

  /* ───────── patients & patient file ───────── */

  r.get('/:bid/patients', (req, res) => {
    const [scope, params] = patientScope(req);
    const where = ['p.business_id = ?', scope];
    const args = [req.biz.id, ...params];
    const q = str(req.query.q, 80);
    if (q) {
      const like = `%${q}%`;
      const key = phoneKey(q);
      where.push(`(p.name LIKE ? OR p.email LIKE ? OR p.id_number LIKE ? OR p.phone LIKE ?${key.length >= 4 ? ' OR p.phone_key LIKE ?' : ''})`);
      args.push(like, like, like, like);
      if (key.length >= 4) args.push(`%${key}%`);
    }
    if (req.query.companyId) where.push('p.company_id = ?') && args.push(Number(req.query.companyId));
    const t = now(req);
    // The "+" keeps SQLite on the per-patient index. For a doctor, "calendar_id IN (...)" next to a start_at
    // range matches the calendar index better on paper, and then every patient's subquery walks the doctor's
    // whole calendar: on 200,000 bookings the list took 12 s and the export 4 minutes, with the server frozen.
    const [aScope0, aIds] = apptScope(req);
    const aScope = aScope0.replace('a.calendar_id', '+a.calendar_id');
    // export=1: every file in scope for the CSV, only the columns it has (no notes or medical text in memory)
    const exporting = req.query.export === '1';
    const rows = all(
      `SELECT ${exporting ? 'p.id, p.name, p.phone, p.email, p.birth_date' : 'p.*'}, c.name AS company_name,
         (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status != 'cancelled' AND ${aScope}) AS visits,
         (SELECT MAX(start_at) FROM appointments a WHERE a.patient_id = p.id AND a.status != 'cancelled' AND a.start_at <= ? AND ${aScope}) AS last_visit,
         (SELECT MIN(start_at) FROM appointments a WHERE a.patient_id = p.id AND a.status IN ('confirmed', 'pending') AND a.start_at > ? AND ${aScope}) AS next_visit,
         (SELECT COALESCE(SUM(price), 0) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed')
           - (SELECT COALESCE(SUM(amount), 0) FROM payments x WHERE x.patient_id = p.id) AS balance
       FROM patients p LEFT JOIN companies c ON c.id = p.company_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${req.query.sort === 'new' ? 'p.created_at DESC' : 'p.name COLLATE NOCASE'}
       LIMIT ${exporting ? 100_000 : int(req.query.limit, 1, 2000, 500)}`,
      ...aIds,
      t,
      ...aIds,
      t,
      ...aIds,
      ...args,
    );
    res.json(
      rows.map((row) => ({
        ...(exporting ? { id: row.id, name: row.name, phone: row.phone, email: row.email, birthDate: row.birth_date } : toPatient(row)),
        companyName: row.company_name,
        visits: row.visits,
        lastVisit: row.last_visit,
        nextVisit: row.next_visit,
        balance: isDesk(req) ? Math.round(row.balance * 100) / 100 : null,
      })),
    );
  });

  r.post('/:bid/patients', (req, res) => {
    const v = patientValues(req);
    const id = createPatient(req.biz, v, req.user.id);
    res.status(201).json(toPatient(get('SELECT * FROM patients WHERE id = ?', id)));
  });

  r.get('/:bid/patients/:pid', (req, res) => {
    const p = ownPatient(req);
    const [scope0, ids] = apptScope(req);
    // one patient's bookings: through the patient index, not the whole of a doctor's calendar (see the list above)
    const scope = scope0.replace('a.calendar_id', '+a.calendar_id');
    const appointments = all(
      `SELECT a.*, c.name AS calendar_name, c.color AS calendar_color, s.name AS service_name,
         (SELECT COALESCE(SUM(amount), 0) FROM payments x WHERE x.appointment_id = a.id) AS paid
       FROM appointments a JOIN calendars c ON c.id = a.calendar_id LEFT JOIN services s ON s.id = a.service_id
       WHERE a.patient_id = ? AND ${scope} ORDER BY a.start_at DESC`,
      p.id,
      ...ids,
    ).map((row) => ({ ...toAppointment(row), calendarName: row.calendar_name, calendarColor: row.calendar_color, serviceName: row.service_name, paid: row.paid }));
    const [rScope, rIds] = recordScope(req);
    const records = all(`SELECT * FROM records r WHERE r.patient_id = ? AND ${rScope} ORDER BY r.created_at DESC, r.id DESC`, p.id, ...rIds).map(toRecord);
    const [pScope, pIds] = paymentScope(req);
    const payments = all(`SELECT * FROM payments pay WHERE pay.patient_id = ? AND ${pScope} ORDER BY paid_at DESC, id DESC`, p.id, ...pIds).map(toPayment);
    const [mScope, mIds] = messageScope(req);
    const messages = all(`SELECT * FROM messages m WHERE m.patient_id = ? AND ${mScope} ORDER BY m.id DESC LIMIT 100`, p.id, ...mIds).map(toMessage);
    const company = companyView(req, p.companyId ? toCompany(get('SELECT * FROM companies WHERE id = ?', p.companyId)) : null);
    const charged = all(`SELECT COALESCE(SUM(price), 0) AS v FROM appointments WHERE patient_id = ? AND status = 'completed'`, p.id)[0].v;
    const paid = all('SELECT COALESCE(SUM(amount), 0) AS v FROM payments WHERE patient_id = ?', p.id)[0].v;
    res.json({
      patient: p,
      company,
      appointments,
      records,
      payments,
      messages,
      totals: isDesk(req) ? { charged, paid, balance: Math.round((charged - paid) * 100) / 100 } : null,
    });
  });

  r.patch('/:bid/patients/:pid', (req, res) => {
    const p = ownPatient(req);
    const v = patientValues(req, p);
    run(
      `UPDATE patients SET name=?, phone=?, phone_key=?, email=?, birth_date=?, gender=?, id_number=?, address=?, medical=?, notes=?,
       source=?, consent=?, company_id=? WHERE id=?`,
      v.name,
      v.phone,
      phoneKey(v.phone),
      v.email,
      v.birthDate,
      v.gender,
      v.idNumber,
      v.address,
      v.medical,
      v.notes,
      v.source,
      v.consent,
      v.companyId,
      p.id,
    );
    // keep the contact details on their future bookings in step
    run(
      `UPDATE appointments SET client_name = ?, client_phone = ?, client_email = ? WHERE patient_id = ? AND start_at >= ?`,
      v.name,
      v.phone,
      v.email,
      p.id,
      now(req),
    );
    res.json(toPatient(get('SELECT * FROM patients WHERE id = ?', p.id)));
  });

  r.delete('/:bid/patients/:pid', ownerOnly, (req, res) => {
    const p = ownPatient(req);
    run('DELETE FROM patients WHERE id = ?', p.id);
    audit(req, 'patient_deleted', { businessId: req.biz.id, detail: { id: p.id, name: p.name } });
    res.json({ ok: true });
  });

  /** Moves every booking, payment, note and message of one patient onto another (duplicates). */
  r.post('/:bid/patients/:pid/merge', deskOnly, (req, res) => {
    const keep = ownPatient(req);
    const drop = ownPatient(req, req.body.otherId);
    if (keep.id === drop.id) fail(400, 'patient_not_found');
    // reception merges duplicates (same phone, email or ID number); anything else is the owner's call
    const same = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
    const duplicate = same(phoneKey(keep.phone), phoneKey(drop.phone)) || same(keep.email, drop.email) || same(keep.idNumber, drop.idNumber) || same(keep.name.trim(), drop.name.trim());
    if (!duplicate && req.access.role !== 'owner') fail(403, 'not_duplicate');
    tx(() => {
      // the kept file takes whatever it was missing from the other one
      const pick = (k) => keep[k] || drop[k] || '';
      run(
        `UPDATE patients SET phone = ?, phone_key = ?, email = ?, birth_date = ?, gender = ?, id_number = ?, address = ?, medical = ?, notes = ?,
         company_id = COALESCE(company_id, ?), user_id = COALESCE(user_id, ?) WHERE id = ?`,
        pick('phone'),
        phoneKey(pick('phone')),
        pick('email'),
        pick('birthDate'),
        pick('gender'),
        pick('idNumber'),
        pick('address'),
        [keep.medical, drop.medical].filter(Boolean).join('\n'),
        [keep.notes, drop.notes].filter(Boolean).join('\n'),
        drop.companyId,
        drop.userId ?? null,
        keep.id,
      );
      for (const table of ['appointments', 'payments', 'records', 'messages']) run(`UPDATE ${table} SET patient_id = ? WHERE patient_id = ?`, keep.id, drop.id);
      run('DELETE FROM patients WHERE id = ?', drop.id);
    });
    audit(req, 'patients_merged', { businessId: req.biz.id, detail: { kept: { id: keep.id, name: keep.name }, removed: { id: drop.id, name: drop.name, phone: drop.phone, email: drop.email, idNumber: drop.idNumber } } });
    res.json({ ok: true });
  });

  const RECORD_KINDS = ['note', 'diagnosis', 'treatment', 'prescription', 'recommendation'];

  r.post('/:bid/patients/:pid/records', (req, res) => {
    const p = ownPatient(req);
    const body = str(req.body.body, 20000);
    const title = str(req.body.title, 200);
    if (!body && !title) fail(400, 'text_required');
    let appointmentId = req.body.appointmentId ? int(req.body.appointmentId, 1, Number.MAX_SAFE_INTEGER, null) : null;
    let calendarId = null;
    if (appointmentId) {
      const a = get('SELECT calendar_id FROM appointments WHERE id = ? AND patient_id = ?', appointmentId, p.id);
      if (!a || !canSee(req, a.calendar_id)) appointmentId = null;
      else calendarId = a.calendar_id;
    }
    const { lastInsertRowid } = run(
      `INSERT INTO records (business_id, patient_id, appointment_id, calendar_id, kind, title, body, author_id, author_name, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      req.biz.id,
      p.id,
      appointmentId,
      calendarId,
      RECORD_KINDS.includes(req.body.kind) ? req.body.kind : 'note',
      title,
      body,
      req.user.id,
      req.user.name,
      now(req),
    );
    res.status(201).json(toRecord(get('SELECT * FROM records WHERE id = ?', lastInsertRowid)));
  });

  const ownRecord = (req) => {
    const rec = toRecord(get('SELECT * FROM records WHERE id = ? AND business_id = ?', req.params.rid, req.biz.id));
    if (!rec) fail(404, 'record_not_found');
    ownPatient(req, rec.patientId);
    // only the author (or the owner) changes what was written
    if (rec.authorId !== req.user.id && req.access.role !== 'owner') fail(403, 'owner_only');
    return rec;
  };

  r.patch('/:bid/records/:rid', (req, res) => {
    const rec = ownRecord(req);
    run(
      'UPDATE records SET kind = ?, title = ?, body = ? WHERE id = ?',
      RECORD_KINDS.includes(req.body.kind) ? req.body.kind : rec.kind,
      'title' in req.body ? str(req.body.title, 200) : rec.title,
      'body' in req.body ? str(req.body.body, 20000) : rec.body,
      rec.id,
    );
    res.json(toRecord(get('SELECT * FROM records WHERE id = ?', rec.id)));
  });

  r.delete('/:bid/records/:rid', (req, res) => {
    const rec = ownRecord(req);
    run('DELETE FROM records WHERE id = ?', rec.id);
    res.json({ ok: true });
  });

  /* ───────── companies ───────── */

  r.get('/:bid/companies', (req, res) => {
    const rows = all(
      `SELECT c.*, (SELECT COUNT(*) FROM patients p WHERE p.company_id = c.id) AS patients
       FROM companies c WHERE c.business_id = ? ORDER BY c.active DESC, c.name COLLATE NOCASE`,
      req.biz.id,
    );
    res.json(rows.map((row) => ({ ...companyView(req, toCompany(row)), patients: row.patients })));
  });

  function companyValues(req, current = {}) {
    const b = req.body;
    const has = (k) => k in b;
    const text = (k, max) => (has(k) ? str(b[k], max) : current[k] ?? '');
    const v = {
      name: has('name') ? str(b.name, 160) || current.name : current.name,
      taxId: text('taxId', 40),
      contact: text('contact', 120),
      phone: text('phone', 40),
      email: text('email', 160),
      address: text('address', 300),
      notes: text('notes', 2000),
      discount: has('discount') ? Math.min(100, Math.max(0, Number(b.discount) || 0)) : current.discount ?? 0,
      active: has('active') ? !!b.active : current.active ?? true,
    };
    if (!v.name) fail(400, 'name_required');
    if (v.email && !isEmail(v.email)) fail(400, 'invalid_email');
    return v;
  }

  r.post('/:bid/companies', deskOnly, (req, res) => {
    const v = companyValues(req);
    const { lastInsertRowid } = run(
      'INSERT INTO companies (business_id, name, tax_id, contact, phone, email, address, discount, notes, active) VALUES (?,?,?,?,?,?,?,?,?,?)',
      req.biz.id,
      v.name,
      v.taxId,
      v.contact,
      v.phone,
      v.email,
      v.address,
      v.discount,
      v.notes,
      v.active,
    );
    res.status(201).json(toCompany(get('SELECT * FROM companies WHERE id = ?', lastInsertRowid)));
  });

  const ownCompany = (req) => {
    const c = toCompany(get('SELECT * FROM companies WHERE id = ? AND business_id = ?', req.params.cid, req.biz.id));
    if (!c) fail(404, 'company_not_found');
    return c;
  };

  r.patch('/:bid/companies/:cid', deskOnly, (req, res) => {
    const c = ownCompany(req);
    const v = companyValues(req, c);
    run(
      'UPDATE companies SET name=?, tax_id=?, contact=?, phone=?, email=?, address=?, discount=?, notes=?, active=? WHERE id=?',
      v.name,
      v.taxId,
      v.contact,
      v.phone,
      v.email,
      v.address,
      v.discount,
      v.notes,
      v.active,
      c.id,
    );
    res.json(toCompany(get('SELECT * FROM companies WHERE id = ?', c.id)));
  });

  r.delete('/:bid/companies/:cid', ownerOnly, (req, res) => {
    const c = ownCompany(req);
    run('DELETE FROM companies WHERE id = ?', c.id);
    audit(req, 'company_deleted', { businessId: req.biz.id, detail: { name: c.name } });
    res.json({ ok: true });
  });

  /* ───────── cashier ───────── */

  const METHODS = ['cash', 'card', 'transfer', 'other'];

  r.get('/:bid/payments', deskOnly, (req, res) => {
    const { from, to, start, end } = range(req);
    const where = ['pay.business_id = ?', 'pay.paid_at >= ?', 'pay.paid_at < ?'];
    const args = [req.biz.id, start, end];
    if (METHODS.includes(req.query.method)) where.push('pay.method = ?') && args.push(req.query.method);
    const rows = all(
      `SELECT pay.*, p.name AS patient_name, a.start_at AS appt_start, c.name AS calendar_name, s.name AS service_name, u.name AS created_by_name
       FROM payments pay
       LEFT JOIN patients p ON p.id = pay.patient_id
       LEFT JOIN appointments a ON a.id = pay.appointment_id
       LEFT JOIN calendars c ON c.id = a.calendar_id
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN users u ON u.id = pay.created_by
       WHERE ${where.join(' AND ')} ORDER BY pay.paid_at DESC, pay.id DESC`,
      ...args,
    );
    const totals = { total: 0, cash: 0, card: 0, transfer: 0, other: 0, count: rows.length };
    for (const row of rows) {
      totals.total += row.amount;
      totals[row.method] += row.amount;
    }
    for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 100) / 100;
    res.json({
      from,
      to,
      totals,
      payments: rows.map((row) => ({
        ...toPayment(row),
        patientName: row.patient_name,
        appointmentStart: row.appt_start,
        calendarName: row.calendar_name,
        serviceName: row.service_name,
        createdByName: row.created_by_name,
      })),
    });
  });

  /** Bookings with a price that are not fully paid yet (completed or in the past). */
  r.get('/:bid/payments/unpaid', deskOnly, (req, res) => {
    const { start, end } = range(req);
    const rows = all(
      `SELECT a.*, c.name AS calendar_name, s.name AS service_name,
         (SELECT COALESCE(SUM(amount), 0) FROM payments x WHERE x.appointment_id = a.id) AS paid
       FROM appointments a JOIN calendars c ON c.id = a.calendar_id LEFT JOIN services s ON s.id = a.service_id
       WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ? AND a.price > 0
         AND a.status NOT IN ('cancelled', 'no_show') AND a.start_at <= ?
         AND a.price > (SELECT COALESCE(SUM(amount), 0) FROM payments x WHERE x.appointment_id = a.id) + 0.001
       ORDER BY a.start_at DESC LIMIT 500`,
      req.biz.id,
      start,
      end,
      now(req),
    );
    res.json(rows.map((row) => ({ ...toAppointment(row), calendarName: row.calendar_name, serviceName: row.service_name, paid: row.paid })));
  });

  r.post('/:bid/payments', (req, res) => {
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e7) fail(400, 'invalid_amount');
    const owner = req.access.role === 'owner';
    // money going out (a refund) takes away from the totals just like deleting a payment: owner only
    if (amount < 0 && !owner) fail(403, 'refund_owner_only');
    let patientId = req.body.patientId ? int(req.body.patientId, 1, Number.MAX_SAFE_INTEGER, null) : null;
    let appointmentId = req.body.appointmentId ? int(req.body.appointmentId, 1, Number.MAX_SAFE_INTEGER, null) : null;
    if (appointmentId) {
      const a = get('SELECT * FROM appointments WHERE id = ? AND business_id = ?', appointmentId, req.biz.id);
      if (!a || !canSee(req, a.calendar_id)) fail(404, 'appointment_not_found');
      // a payment for a visit is that visit's patient's, whatever the request says
      patientId = a.patient_id;
    } else if (!isDesk(req)) fail(403, 'owner_only'); // doctors take payments only for their own bookings
    if (patientId) ownPatient(req, patientId);
    // only the owner writes into past days (or the future): the rest of the team records money as it comes in
    let paidAt = DT_RE.test(req.body.paidAt || '') ? req.body.paidAt : now(req);
    if (!owner && (paidAt.slice(0, 10) !== today(req) || paidAt > now(req))) paidAt = now(req);
    const { lastInsertRowid } = run(
      'INSERT INTO payments (business_id, patient_id, appointment_id, amount, method, note, paid_at, created_by) VALUES (?,?,?,?,?,?,?,?)',
      req.biz.id,
      patientId,
      appointmentId,
      amount,
      METHODS.includes(req.body.method) ? req.body.method : 'cash',
      str(req.body.note, 300),
      paidAt,
      req.user.id,
    );
    if (amount < 0) audit(req, 'refund', { businessId: req.biz.id, detail: { amount, patientId } });
    // paying for a visit that already happened marks it as done
    if (appointmentId && req.body.complete) run("UPDATE appointments SET status = 'completed' WHERE id = ? AND status IN ('confirmed', 'pending')", appointmentId);
    res.status(201).json(toPayment(get('SELECT * FROM payments WHERE id = ?', lastInsertRowid)));
  });

  r.delete('/:bid/payments/:payid', ownerOnly, (req, res) => {
    const pay = get('SELECT * FROM payments WHERE id = ? AND business_id = ?', req.params.payid, req.biz.id);
    run('DELETE FROM payments WHERE id = ? AND business_id = ?', req.params.payid, req.biz.id);
    if (pay) audit(req, 'payment_deleted', { businessId: req.biz.id, detail: { amount: pay.amount, method: pay.method, paidAt: pay.paid_at, patientId: pay.patient_id } });
    res.json({ ok: true });
  });

  /* ───────── dashboard ───────── */

  function statusCounts(req, start, end) {
    const [scope, ids] = apptScope(req);
    return get(
      `SELECT COUNT(*) AS total,
         SUM(a.status = 'completed') AS completed, SUM(a.status = 'confirmed') AS confirmed, SUM(a.status = 'pending') AS pending,
         SUM(a.status = 'cancelled') AS cancelled, SUM(a.status = 'no_show') AS noShow,
         SUM(a.status = 'cancelled' OR a.status = 'no_show') AS lost,
         SUM(a.source = 'online') AS online
       FROM appointments a WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ? AND ${scope}`,
      req.biz.id,
      start,
      end,
      ...ids,
    );
  }
  const zeroNulls = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? 0]));

  function revenue(req, start, end) {
    const [scope, ids] = paymentScope(req);
    return get(`SELECT COALESCE(SUM(amount), 0) AS v FROM payments pay WHERE pay.business_id = ? AND pay.paid_at >= ? AND pay.paid_at < ? AND ${scope}`, req.biz.id, start, end, ...ids).v;
  }

  function owed(req, start, end) {
    const [scope, ids] = apptScope(req);
    return get(
      `SELECT COALESCE(SUM(a.price - (SELECT COALESCE(SUM(amount), 0) FROM payments x WHERE x.appointment_id = a.id)), 0) AS v
       FROM appointments a WHERE a.business_id = ? AND a.status = 'completed' AND a.price > 0 AND a.start_at >= ? AND a.start_at < ? AND ${scope}
         AND a.price > (SELECT COALESCE(SUM(amount), 0) FROM payments x WHERE x.appointment_id = a.id)`,
      req.biz.id,
      start,
      end,
      ...ids,
    ).v;
  }

  function patientCounts(req, start, end) {
    const [pScope, pIds] = patientScope(req);
    const [aScope, aIds] = apptScope(req);
    return {
      new: get(`SELECT COUNT(*) AS n FROM patients p WHERE p.business_id = ? AND p.created_at >= ? AND p.created_at < ? AND ${pScope}`, req.biz.id, start, end, ...pIds).n,
      unique: get(
        `SELECT COUNT(DISTINCT a.patient_id) AS n FROM appointments a
         WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ? AND a.status != 'cancelled' AND a.patient_id IS NOT NULL AND ${aScope}`,
        req.biz.id,
        start,
        end,
        ...aIds,
      ).n,
    };
  }

  r.get('/:bid/dashboard', (req, res) => {
    const rg = range(req);
    const t0 = `${rg.today}T00:00`;
    const t1 = `${addDays(rg.today, 1)}T00:00`;
    const [aScope, aIds] = apptScope(req);
    const [payScope, payIds] = paymentScope(req);
    const perCalendar = all(
      `SELECT c.id, c.name, c.color,
         COUNT(a.id) AS total, SUM(a.status = 'completed') AS completed, SUM(a.status = 'cancelled') AS cancelled, SUM(a.status = 'no_show') AS noShow,
         COUNT(DISTINCT CASE WHEN a.status != 'cancelled' THEN a.patient_id END) AS patients,
         COALESCE(SUM(CASE WHEN a.status = 'completed' THEN a.price END), 0) AS billed
       FROM calendars c LEFT JOIN appointments a ON a.calendar_id = c.id AND a.start_at >= ? AND a.start_at < ?
       WHERE c.business_id = ? AND ${aScope.replace('a.calendar_id', 'c.id')}
       GROUP BY c.id ORDER BY c.position, c.id`,
      rg.start,
      rg.end,
      req.biz.id,
      ...aIds,
    );
    const paidByCal = Object.fromEntries(
      all(
        `SELECT a.calendar_id AS id, SUM(pay.amount) AS v FROM payments pay JOIN appointments a ON a.id = pay.appointment_id
         WHERE pay.business_id = ? AND pay.paid_at >= ? AND pay.paid_at < ? AND ${payScope} GROUP BY a.calendar_id`,
        req.biz.id,
        rg.start,
        rg.end,
        ...payIds,
      ).map((x) => [x.id, x.v]),
    );
    const upcoming = all(
      `SELECT a.*, c.name AS calendar_name, c.color AS calendar_color, s.name AS service_name FROM appointments a
       JOIN calendars c ON c.id = a.calendar_id LEFT JOIN services s ON s.id = a.service_id
       WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ? AND a.status IN ('confirmed', 'pending') AND ${aScope}
       ORDER BY a.start_at LIMIT 8`,
      req.biz.id,
      now(req),
      t1,
      ...aIds,
    ).map((row) => ({ ...toAppointment(row), calendarName: row.calendar_name, calendarColor: row.calendar_color, serviceName: row.service_name }));

    res.json({
      ...rg,
      canSeeAllMoney: isDesk(req),
      patients: { today: patientCounts(req, t0, t1), period: patientCounts(req, rg.start, rg.end) },
      appointments: { today: zeroNulls(statusCounts(req, t0, t1)), period: zeroNulls(statusCounts(req, rg.start, rg.end)) },
      money: {
        today: revenue(req, t0, t1),
        period: revenue(req, rg.start, rg.end),
        owed: owed(req, rg.start, rg.end),
      },
      perCalendar: perCalendar.map((c) => ({ ...zeroNulls(c), paid: paidByCal[c.id] ?? 0 })),
      upcoming,
    });
  });

  /** The rows behind one dashboard card (the table icon). */
  r.get('/:bid/dashboard/list', (req, res) => {
    const rg = range(req);
    const day = req.query.span === 'today';
    const start = day ? `${rg.today}T00:00` : rg.start;
    const end = day ? `${addDays(rg.today, 1)}T00:00` : rg.end;
    const metric = String(req.query.metric || '');
    if (metric === 'newPatients' || metric === 'uniquePatients') {
      const [pScope, pIds] = patientScope(req);
      const [aScope, aIds] = apptScope(req);
      const rows =
        metric === 'newPatients'
          ? all(`SELECT p.* FROM patients p WHERE p.business_id = ? AND p.created_at >= ? AND p.created_at < ? AND ${pScope} ORDER BY p.created_at DESC`, req.biz.id, start, end, ...pIds)
          : all(
              `SELECT p.*, COUNT(a.id) AS visits FROM patients p JOIN appointments a ON a.patient_id = p.id
               WHERE p.business_id = ? AND a.start_at >= ? AND a.start_at < ? AND a.status != 'cancelled' AND ${aScope}
               GROUP BY p.id ORDER BY p.name COLLATE NOCASE`,
              req.biz.id,
              start,
              end,
              ...aIds,
            );
      return res.json({ type: 'patients', rows: rows.map((row) => ({ ...toPatient(row), visits: row.visits })) });
    }
    if (metric === 'payments') {
      const [scope, ids] = paymentScope(req);
      const rows = all(
        `SELECT pay.*, p.name AS patient_name FROM payments pay LEFT JOIN patients p ON p.id = pay.patient_id
         WHERE pay.business_id = ? AND pay.paid_at >= ? AND pay.paid_at < ? AND ${scope} ORDER BY pay.paid_at DESC`,
        req.biz.id,
        start,
        end,
        ...ids,
      );
      return res.json({ type: 'payments', rows: rows.map((row) => ({ ...toPayment(row), patientName: row.patient_name })) });
    }
    const STATUS = { completed: ['completed'], cancelled: ['cancelled'], noShow: ['no_show'], lost: ['cancelled', 'no_show'], pending: ['pending'], all: null };
    if (!(metric in STATUS)) fail(400, 'invalid_metric');
    const [scope, ids] = apptScope(req);
    const statuses = STATUS[metric];
    const rows = all(
      `SELECT a.*, c.name AS calendar_name, c.color AS calendar_color, s.name AS service_name FROM appointments a
       JOIN calendars c ON c.id = a.calendar_id LEFT JOIN services s ON s.id = a.service_id
       WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ? AND ${scope}
       ${statuses ? `AND a.status IN (${statuses.map(() => '?').join(',')})` : ''} ORDER BY a.start_at DESC LIMIT 1000`,
      req.biz.id,
      start,
      end,
      ...ids,
      ...(statuses ?? []),
    );
    res.json({ type: 'appointments', rows: rows.map((row) => ({ ...toAppointment(row), calendarName: row.calendar_name, calendarColor: row.calendar_color, serviceName: row.service_name })) });
  });

  /* ───────── reports ───────── */

  r.get('/:bid/reports', deskOnly, (req, res) => {
    const rg = range(req);
    const q = (sql) => all(sql, req.biz.id, rg.start, rg.end);
    const appts = `FROM appointments a WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ?`;
    const counts = `COUNT(*) AS total, SUM(a.status = 'completed') AS completed, SUM(a.status = 'cancelled') AS cancelled,
      SUM(a.status = 'no_show') AS noShow, COALESCE(SUM(CASE WHEN a.status = 'completed' THEN a.price END), 0) AS billed`;
    const paidFor = (col) => `COALESCE((SELECT SUM(pay.amount) FROM payments pay JOIN appointments b ON b.id = pay.appointment_id
       WHERE pay.business_id = a.business_id AND pay.paid_at >= ? AND pay.paid_at < ? AND b.${col} IS a.${col}), 0)`;
    res.json({
      ...rg,
      byCalendar: all(
        `SELECT a.calendar_id AS id, c.name, c.color, ${counts}, ${paidFor('calendar_id')} AS paid
         FROM appointments a JOIN calendars c ON c.id = a.calendar_id
         WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ? GROUP BY a.calendar_id ORDER BY c.position`,
        rg.start,
        rg.end,
        req.biz.id,
        rg.start,
        rg.end,
      ).map(zeroNulls),
      byService: q(
        `SELECT a.service_id AS id, COALESCE(s.name, '') AS name, ${counts}
         FROM appointments a LEFT JOIN services s ON s.id = a.service_id
         WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ? GROUP BY a.service_id ORDER BY total DESC`,
      ).map(zeroNulls),
      byCompany: q(
        `SELECT p.company_id AS id, COALESCE(co.name, '') AS name, COUNT(DISTINCT a.patient_id) AS patients, ${counts}
         FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id LEFT JOIN companies co ON co.id = p.company_id
         WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ? GROUP BY p.company_id ORDER BY total DESC`,
      ).map(zeroNulls),
      byDay: q(`SELECT substr(a.start_at, 1, 10) AS day, ${counts} ${appts} GROUP BY day ORDER BY day`).map(zeroNulls),
      bySource: q(`SELECT a.source AS id, COUNT(*) AS total ${appts} GROUP BY a.source`),
      byMethod: all(
        `SELECT method AS id, COUNT(*) AS count, SUM(amount) AS total FROM payments WHERE business_id = ? AND paid_at >= ? AND paid_at < ? GROUP BY method`,
        req.biz.id,
        rg.start,
        rg.end,
      ),
      newPatients: get('SELECT COUNT(*) AS n FROM patients WHERE business_id = ? AND created_at >= ? AND created_at < ?', req.biz.id, rg.start, rg.end).n,
      noShows: all(
        `SELECT a.*, c.name AS calendar_name FROM appointments a JOIN calendars c ON c.id = a.calendar_id
         WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ? AND a.status = 'no_show' ORDER BY a.start_at DESC LIMIT 300`,
        req.biz.id,
        rg.start,
        rg.end,
      ).map((row) => ({ ...toAppointment(row), calendarName: row.calendar_name })),
    });
  });

  /* ───────── search ───────── */

  r.get('/:bid/search', (req, res) => {
    const q = str(req.query.q, 80);
    if (q.length < 2) return res.json({ patients: [], appointments: [], companies: [] });
    const like = `%${q}%`;
    const key = phoneKey(q);
    const phoneLike = key.length >= 4 ? `%${key}%` : '\u0000';
    const [pScope, pIds] = patientScope(req);
    const patients = all(
      `SELECT p.* FROM patients p WHERE p.business_id = ? AND ${pScope}
       AND (p.name LIKE ? OR p.email LIKE ? OR p.id_number LIKE ? OR p.phone_key LIKE ?) ORDER BY p.name COLLATE NOCASE LIMIT 20`,
      req.biz.id,
      ...pIds,
      like,
      like,
      like,
      phoneLike,
    ).map(toPatient);
    const [aScope, aIds] = apptScope(req);
    const appointments = all(
      `SELECT a.*, c.name AS calendar_name, c.color AS calendar_color, s.name AS service_name FROM appointments a
       JOIN calendars c ON c.id = a.calendar_id LEFT JOIN services s ON s.id = a.service_id
       WHERE a.business_id = ? AND ${aScope} AND (a.client_name LIKE ? OR a.client_email LIKE ? OR a.notes LIKE ?
         OR replace(replace(replace(a.client_phone, ' ', ''), '-', ''), '.', '') LIKE ?)
       ORDER BY a.start_at >= ? DESC, abs(julianday(substr(a.start_at, 1, 10)) - julianday(?)) LIMIT 20`,
      req.biz.id,
      ...aIds,
      like,
      like,
      like,
      phoneLike,
      today(req),
      today(req),
    ).map((row) => ({ ...toAppointment(row), calendarName: row.calendar_name, calendarColor: row.calendar_color, serviceName: row.service_name }));
    const companies = isDesk(req)
      ? all('SELECT * FROM companies WHERE business_id = ? AND (name LIKE ? OR tax_id LIKE ?) ORDER BY name LIMIT 10', req.biz.id, like, like).map(toCompany)
      : [];
    res.json({ patients, appointments, companies });
  });

  /* ───────── notifications ───────── */

  const notificationWhere = (req) => {
    const [scope, ids] = calendarScope(req);
    // business-wide notices (no calendar) go to the desk only
    const cal = req.access.calendarIds === null ? '1 = 1' : `(n.${scope})`;
    return [`n.business_id = ? AND ${cal} AND COALESCE(n.actor_id, 0) != ?`, [req.biz.id, ...ids, req.user.id]];
  };
  const lastSeen = (req) => get('SELECT last_id FROM notification_seen WHERE user_id = ? AND business_id = ?', req.user.id, req.biz.id)?.last_id ?? 0;

  r.get('/:bid/notifications/count', (req, res) => {
    const [where, params] = notificationWhere(req);
    res.json({ unread: get(`SELECT COUNT(*) AS n FROM notifications n WHERE ${where} AND n.id > ?`, ...params, lastSeen(req)).n });
  });

  r.get('/:bid/notifications', (req, res) => {
    const [where, params] = notificationWhere(req);
    const seen = lastSeen(req);
    const rows = all(
      `SELECT n.*, c.name AS calendar_name, c.color AS calendar_color, u.name AS actor_name, a.status AS appt_status, a.start_at AS appt_start
       FROM notifications n LEFT JOIN calendars c ON c.id = n.calendar_id LEFT JOIN users u ON u.id = n.actor_id
       LEFT JOIN appointments a ON a.id = n.appointment_id
       WHERE ${where} ORDER BY n.id DESC LIMIT ${int(req.query.limit, 1, 200, 60)}`,
      ...params,
    );
    res.json({
      lastSeen: seen,
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        data: parseJSON(row.data, {}),
        calendarName: row.calendar_name,
        calendarColor: row.calendar_color,
        actorName: row.actor_name,
        appointmentId: row.appointment_id,
        appointmentStatus: row.appt_status,
        appointmentStart: row.appt_start,
        createdAt: row.created_at,
        unread: row.id > seen,
      })),
    });
  });

  r.post('/:bid/notifications/seen', (req, res) => {
    const id = int(req.body.lastId, 0, Number.MAX_SAFE_INTEGER, 0);
    run(
      `INSERT INTO notification_seen (user_id, business_id, last_id) VALUES (?, ?, ?)
       ON CONFLICT(user_id, business_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`,
      req.user.id,
      req.biz.id,
      id,
    );
    res.json({ ok: true });
  });

  /* ───────── SMS & WhatsApp ───────── */

  const lang = (req) => (req.query.lang === 'ro' || req.body?.lang === 'ro' ? 'ro' : req.query.lang === 'en' || req.body?.lang === 'en' ? 'en' : req.user.lang);

  r.get('/:bid/messages', (req, res) => {
    const { start, end } = range(req);
    const [scope, ids] = messageScope(req);
    const rows = all(
      `SELECT m.*, p.name AS patient_name FROM messages m LEFT JOIN patients p ON p.id = m.patient_id
       WHERE m.business_id = ? AND m.created_at >= ? AND m.created_at < ? AND ${scope}
       ORDER BY m.id DESC LIMIT 500`,
      req.biz.id,
      start,
      end,
      ...ids,
    );
    res.json(rows.map((row) => ({ ...toMessage(row), patientName: row.patient_name })));
  });

  /** Bookings on a day with whether a reminder went out: the daily "send reminders" list. */
  r.get('/:bid/messages/reminders', (req, res) => {
    const date = DATE_RE.test(req.query.date || '') ? req.query.date : addDays(today(req), 1);
    const [scope, ids] = apptScope(req);
    const rows = all(
      `SELECT a.*, c.name AS calendar_name, c.color AS calendar_color, s.name AS service_name, COALESCE(p.consent, 1) AS consent,
         (SELECT MAX(x.created_at) FROM messages x WHERE x.appointment_id = a.id AND x.kind = 'reminder' AND x.status != 'failed') AS reminded_at
       FROM appointments a JOIN calendars c ON c.id = a.calendar_id LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN patients p ON p.id = a.patient_id
       WHERE a.business_id = ? AND a.start_at >= ? AND a.start_at < ? AND a.status IN ('confirmed', 'pending') AND ${scope}
       ORDER BY a.start_at`,
      req.biz.id,
      `${date}T00:00`,
      `${addDays(date, 1)}T00:00`,
      ...ids,
    );
    res.json({
      date,
      rows: rows.map((row) => ({
        ...toAppointment(row),
        calendarName: row.calendar_name,
        calendarColor: row.calendar_color,
        serviceName: row.service_name,
        consent: !!row.consent,
        remindedAt: row.reminded_at,
      })),
    });
  });

  r.get('/:bid/messages/settings', ownerOnly, (req, res) => {
    const i = getIntegration(req.biz.id);
    res.json({
      provider: i.provider === 'twilio' ? 'twilio' : 'manual',
      ready: twilioReady(i),
      twilioSid: i.twilioSid ?? '',
      hasToken: !!i.twilioToken,
      smsFrom: i.smsFrom ?? '',
      whatsappFrom: i.whatsappFrom ?? '',
      defaults: DEFAULT_TEMPLATES[lang(req)],
    });
  });

  r.patch('/:bid/messages/settings', ownerOnly, (req, res) => {
    const cur = getIntegration(req.biz.id);
    const b = req.body;
    const next = {
      provider: b.provider === 'twilio' ? 'twilio' : b.provider === 'manual' ? 'manual' : cur.provider ?? 'manual',
      twilioSid: 'twilioSid' in b ? str(b.twilioSid, 64) : cur.twilioSid ?? '',
      // the token is write-only: an empty field keeps the saved one
      twilioToken: b.twilioToken ? str(b.twilioToken, 128) : cur.twilioToken ?? '',
      smsFrom: 'smsFrom' in b ? str(b.smsFrom, 40) : cur.smsFrom ?? '',
      whatsappFrom: 'whatsappFrom' in b ? str(b.whatsappFrom, 40) : cur.whatsappFrom ?? '',
    };
    if (b.clearToken) next.twilioToken = '';
    saveIntegration(req.biz.id, next);
    audit(req, 'messaging_settings', { businessId: req.biz.id, detail: { provider: next.provider, tokenChanged: !!b.twilioToken || !!b.clearToken } });
    res.json({ ok: true, ready: twilioReady(next) });
  });

  /** Text and links for a message, without sending anything. */
  function compose(req) {
    const kind = ['reminder', 'confirmation', 'custom'].includes(req.body.kind) ? req.body.kind : 'custom';
    const channel = req.body.channel === 'sms' ? 'sms' : 'whatsapp';
    let appt = null;
    let patient = null;
    if (req.body.appointmentId) {
      appt = get('SELECT * FROM appointments WHERE id = ? AND business_id = ?', req.body.appointmentId, req.biz.id);
      if (!appt || !canSee(req, appt.calendar_id)) fail(404, 'appointment_not_found');
      if (appt.patient_id) patient = toPatient(get('SELECT * FROM patients WHERE id = ?', appt.patient_id));
    } else if (req.body.patientId) patient = ownPatient(req, req.body.patientId);
    const phone = str(req.body.phone, 40) || appt?.client_phone || patient?.phone || '';
    if (!phone) fail(400, 'phone_required');
    const vars = appt ? appointmentVars(req.biz, appt, lang(req)) : { ...appointmentVars(req.biz, null, lang(req)), name: patient?.name ?? '' };
    const body = str(req.body.body, 1600) || renderTemplate(templateFor(req.biz, kind, lang(req)), vars);
    return { kind, channel, appt, patient, phone, body };
  }

  r.post('/:bid/messages/preview', (req, res) => {
    const m = compose(req);
    res.json({ to: m.phone, body: m.body, link: manualLink(m.channel, m.phone, m.body, req.biz.settings.messaging?.countryCode) });
  });

  /**
   * mode "manual": logs the message and returns the WhatsApp / SMS link the browser opens.
   * mode "auto": sends through the business's provider now.
   */
  r.post('/:bid/messages', async (req, res, next) => {
    try {
      const m = compose(req);
      const base = { patientId: m.patient?.id ?? m.appt?.patient_id ?? null, appointmentId: m.appt?.id ?? null, channel: m.channel, kind: m.kind, toPhone: m.phone, body: m.body, createdBy: req.user.id };
      if (req.body.mode === 'auto') {
        const i = getIntegration(req.biz.id);
        if (!twilioReady(i)) fail(400, 'provider_not_ready');
        const result = await sendViaTwilio(i, m.channel, m.phone, m.body, req.biz.settings.messaging?.countryCode);
        const id = logMessage(req.biz, { ...base, status: result.ok ? 'sent' : 'failed', error: result.error });
        if (!result.ok) fail(502, 'send_failed', { reason: result.error });
        return res.status(201).json(toMessage(get('SELECT * FROM messages WHERE id = ?', id)));
      }
      const id = logMessage(req.biz, { ...base, status: 'manual' });
      res.status(201).json({ ...toMessage(get('SELECT * FROM messages WHERE id = ?', id)), link: manualLink(m.channel, m.phone, m.body, req.biz.settings.messaging?.countryCode) });
    } catch (e) {
      next(e);
    }
  });
}
