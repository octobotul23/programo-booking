import { all, get, run, tx } from './db.js';
import { DEFAULT_SETTINGS, PALETTE, PRESETS } from './presets.js';
import { DATE_RE, TIME_RE, WEEKDAYS, addDays, addMinutes, diffMinutes, fromMin, nowIn, toMin, weekdayKey } from './time.js';
import { fail, int, isColor, isEmail, parseJSON, slugify, str } from './util.js';

/* ───────── serialisation ───────── */

export const toMember = (row) =>
  row && {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    access: row.access,
    calendarIds: parseJSON(row.calendar_ids, []),
    status: row.user_id ? 'active' : 'invited',
    // the link only exists until it is used
    inviteToken: row.user_id ? null : row.invite_token,
    createdAt: row.created_at,
  };

export const toBusiness = (row) =>
  row && {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    description: row.description,
    phone: row.phone,
    email: row.email,
    address: row.address,
    settings: { ...DEFAULT_SETTINGS, ...parseJSON(row.settings, {}) },
  };

export const toCalendar = (row) =>
  row && {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    capacity: row.capacity,
    defaultDuration: row.default_duration,
    hours: parseJSON(row.hours, {}),
    position: row.position,
    active: !!row.active,
  };

export const toService = (row) =>
  row && {
    id: row.id,
    name: row.name,
    description: row.description,
    duration: row.duration,
    price: row.price,
    color: row.color,
    calendarIds: parseJSON(row.calendar_ids, []),
    position: row.position,
    active: !!row.active,
  };

export const toAppointment = (row) =>
  row && {
    id: row.id,
    businessId: row.business_id,
    calendarId: row.calendar_id,
    serviceId: row.service_id,
    clientId: row.client_id,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    start: row.start_at,
    end: row.end_at,
    status: row.status,
    notes: row.notes,
    custom: parseJSON(row.custom, {}),
    source: row.source,
    createdAt: row.created_at,
    patientId: row.patient_id ?? null,
    price: row.price ?? null,
  };

/** What the person who booked may see of their booking: none of the clinic's own fields (notes, price, patient file). */
export const toClientAppointment = (row) =>
  row && {
    id: row.id,
    businessId: row.business_id,
    calendarId: row.calendar_id,
    serviceId: row.service_id,
    clientName: row.client_name,
    start: row.start_at,
    end: row.end_at,
    status: row.status,
  };

export const toCompany = (row) =>
  row && {
    id: row.id,
    name: row.name,
    taxId: row.tax_id,
    contact: row.contact,
    phone: row.phone,
    email: row.email,
    address: row.address,
    discount: row.discount,
    notes: row.notes,
    active: !!row.active,
  };

export const toPatient = (row) =>
  row && {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    birthDate: row.birth_date,
    gender: row.gender,
    idNumber: row.id_number,
    address: row.address,
    medical: row.medical,
    notes: row.notes,
    source: row.source,
    consent: !!row.consent,
    createdAt: row.created_at,
  };

export const toPayment = (row) =>
  row && {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    amount: row.amount,
    method: row.method,
    note: row.note,
    paidAt: row.paid_at,
    createdBy: row.created_by,
  };

export const toRecord = (row) =>
  row && {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    calendarId: row.calendar_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: row.created_at,
  };

export const toMessage = (row) =>
  row && {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    channel: row.channel,
    kind: row.kind,
    toPhone: row.to_phone,
    body: row.body,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
  };

export const listCalendars = (bizId, onlyActive = false) =>
  all(`SELECT * FROM calendars WHERE business_id = ? ${onlyActive ? 'AND active = 1' : ''} ORDER BY position, id`, bizId).map(toCalendar);

export const listServices = (bizId, onlyActive = false) =>
  all(`SELECT * FROM services WHERE business_id = ? ${onlyActive ? 'AND active = 1' : ''} ORDER BY position, id`, bizId).map(toService);

/* ───────── validation of editable shapes ───────── */

export function cleanHours(input) {
  const out = {};
  for (const day of WEEKDAYS) {
    const list = Array.isArray(input?.[day]) ? input[day] : [];
    out[day] = list
      .filter((r) => Array.isArray(r) && TIME_RE.test(r[0]) && TIME_RE.test(r[1]) && toMin(r[0]) < toMin(r[1]))
      .slice(0, 6)
      .sort((a, b) => toMin(a[0]) - toMin(b[0]));
  }
  return out;
}

const FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'checkbox', 'date'];

export function cleanSettings(current, patch = {}) {
  const s = { ...current };
  const bool = (k) => {
    if (k in patch) s[k] = !!patch[k];
  };
  const num = (k, min, max) => {
    if (k in patch) s[k] = int(patch[k], min, max, s[k]);
  };
  if (['staff_only', 'public'].includes(patch.bookingMode)) s.bookingMode = patch.bookingMode;
  ['requireApproval', 'requireAccount', 'requirePhone', 'requireEmail', 'allowClientCancel', 'showPrices', 'hideCancelled'].forEach(bool);
  num('cancelHours', 0, 720);
  num('defaultDuration', 5, 720);
  num('slotInterval', 5, 240);
  num('minNoticeHours', 0, 720);
  num('maxDaysAhead', 1, 730);
  num('bufferMinutes', 0, 240);
  num('weekStart', 0, 1);
  if (typeof patch.timezone === 'string') {
    try {
      new Intl.DateTimeFormat('en', { timeZone: patch.timezone });
      s.timezone = patch.timezone;
    } catch {
      /* ignore unknown zones */
    }
  }
  if ('currency' in patch) s.currency = str(patch.currency, 8).toUpperCase();
  if ('calendarLabel' in patch) s.calendarLabel = str(patch.calendarLabel, 40);
  if ('clientLabel' in patch) s.clientLabel = str(patch.clientLabel, 40);
  if ('welcomeMessage' in patch) s.welcomeMessage = str(patch.welcomeMessage, 1000);
  if (TIME_RE.test(patch.dayStart)) s.dayStart = patch.dayStart;
  if (TIME_RE.test(patch.dayEnd)) s.dayEnd = patch.dayEnd;
  if (toMin(s.dayStart) >= toMin(s.dayEnd)) [s.dayStart, s.dayEnd] = [DEFAULT_SETTINGS.dayStart, DEFAULT_SETTINGS.dayEnd];
  if (patch.messaging && typeof patch.messaging === 'object') {
    const cur = { ...DEFAULT_SETTINGS.messaging, ...s.messaging };
    const p = patch.messaging;
    s.messaging = {
      channel: p.channel === 'sms' || p.channel === 'whatsapp' ? p.channel : cur.channel,
      autoReminder: 'autoReminder' in p ? !!p.autoReminder : cur.autoReminder,
      reminderHours: 'reminderHours' in p ? int(p.reminderHours, 1, 168, cur.reminderHours) : cur.reminderHours,
      countryCode: 'countryCode' in p ? String(p.countryCode).replace(/\D/g, '').slice(0, 4) || '40' : cur.countryCode,
      templates: {
        reminder: p.templates && 'reminder' in p.templates ? str(p.templates.reminder, 600) : cur.templates?.reminder ?? '',
        confirmation: p.templates && 'confirmation' in p.templates ? str(p.templates.confirmation, 600) : cur.templates?.confirmation ?? '',
      },
    };
  }
  if (Array.isArray(patch.customFields)) {
    s.customFields = patch.customFields.slice(0, 30).map((f, i) => ({
      id: str(f.id, 40) || `f${Date.now().toString(36)}${i}`,
      label: str(f.label, 80) || `Field ${i + 1}`,
      type: FIELD_TYPES.includes(f.type) ? f.type : 'text',
      required: !!f.required,
      options: Array.isArray(f.options) ? f.options.map((o) => str(o, 80)).filter(Boolean).slice(0, 30) : [],
    }));
  }
  return s;
}

/* ───────── business creation ───────── */

export function uniqueSlug(base, exceptId = 0) {
  const root = slugify(base);
  let slug = root;
  for (let i = 2; get('SELECT 1 FROM businesses WHERE slug = ? AND id != ?', slug, exceptId); i++) slug = `${root}-${i}`;
  return slug;
}

export function createBusiness(ownerId, { name, type, lang = 'en', calendars, bookingMode, requireApproval }) {
  const preset = PRESETS[type] ?? PRESETS.other;
  const l = lang === 'ro' ? 'ro' : 'en';
  const settings = cleanSettings(DEFAULT_SETTINGS, { bookingMode, requireApproval });
  if (type === 'gym') settings.slotInterval = 60;

  return tx(() => {
    const { lastInsertRowid: bizId } = run(
      'INSERT INTO businesses (owner_id, name, slug, type, settings) VALUES (?, ?, ?, ?, ?)',
      ownerId,
      name,
      uniqueSlug(name),
      PRESETS[type] ? type : 'other',
      JSON.stringify(settings),
    );
    // the owner may rename / add / remove the preset calendars during onboarding
    const cals =
      Array.isArray(calendars) && calendars.length
        ? calendars.slice(0, 20).map((c) => ({ name: { [l]: str(c.name, 80) || 'Calendar' }, capacity: c.capacity }))
        : preset.calendars;
    cals.forEach((c, i) => {
      run(
        'INSERT INTO calendars (business_id, name, color, capacity, hours, position) VALUES (?, ?, ?, ?, ?, ?)',
        bizId,
        c.name[l] ?? c.name.en,
        PALETTE[i % PALETTE.length],
        int(c.capacity, 1, 500, 1),
        JSON.stringify(preset.hours()),
        i,
      );
    });
    preset.services.forEach((s, i) => {
      run(
        'INSERT INTO services (business_id, name, duration, price, position) VALUES (?, ?, ?, ?, ?)',
        bizId,
        s.name[l],
        s.duration,
        s.price,
        i,
      );
    });
    return Number(bizId);
  });
}

/* ───────── who may open which business ───────── */

/** Businesses a user works in: the ones they own, or the ones they joined as staff. */
export function businessesFor(user) {
  if (user.role === 'business') return all('SELECT * FROM businesses WHERE owner_id = ? ORDER BY id', user.id).map(toBusiness);
  if (user.role === 'staff')
    return all('SELECT b.* FROM businesses b JOIN members m ON m.business_id = b.id WHERE m.user_id = ? ORDER BY b.id', user.id).map(toBusiness);
  return [];
}

/**
 * What the user may do in one business. calendarIds === null means every calendar.
 * Returns null when they have no access at all.
 */
export function accessFor(user, biz) {
  if (biz.ownerId === user.id) return { role: 'owner', access: 'all', calendarIds: null };
  const m = toMember(get('SELECT * FROM members WHERE business_id = ? AND user_id = ?', biz.id, user.id));
  if (!m) return null;
  return { role: 'staff', memberId: m.id, access: m.access, calendarIds: m.access === 'all' ? null : m.calendarIds };
}

const ALL = ['1 = 1', []];

/**
 * SQL limiting patients (aliased `alias`) to the ones a user may open, plus its parameters:
 * everyone for the owner and reception; for a doctor, the patients booked in their calendars
 * and the ones they added themselves.
 */
export function patientScopeSql(access, userId, alias = 'p') {
  if (access.calendarIds === null) return ALL;
  const ids = access.calendarIds;
  return [
    `(${alias}.created_by = ? OR EXISTS (SELECT 1 FROM appointments x WHERE x.patient_id = ${alias}.id AND x.calendar_id IN (${ids.map(() => '?').join(',') || 'NULL'})))`,
    [userId, ...ids],
  ];
}

/* ───────── availability ───────── */

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

/** How long a booking lasts: service > calendar > business default. */
export const resolveDuration = (biz, calendar, service) =>
  service?.duration || calendar.defaultDuration || biz.settings.defaultDuration;

export function timeOffFor(bizId, calendarId, from, to) {
  return all(
    `SELECT * FROM time_off WHERE business_id = ? AND (calendar_id IS NULL OR calendar_id = ?)
     AND start_at < ? AND end_at > ?`,
    bizId,
    calendarId,
    to,
    from,
  );
}

function busyFor(calendarId, from, to, excludeId = 0) {
  return all(
    `SELECT start_at, end_at FROM appointments WHERE calendar_id = ? AND status != 'cancelled'
     AND start_at < ? AND end_at > ? AND id != ?`,
    calendarId,
    to,
    from,
    excludeId,
  );
}

/**
 * Free slots for one calendar on one date.
 * Returns [{ time: 'HH:MM', spots }] — spots = places left (capacity - booked).
 */
export function getSlots(biz, calendar, date, duration, { forClient = true } = {}) {
  const s = biz.settings;
  const now = nowIn(s.timezone);
  const today = now.slice(0, 10);
  if (forClient && (date < today || date > addDays(today, s.maxDaysAhead))) return [];
  const earliest = forClient ? addMinutes(now, s.minNoticeHours * 60) : '0000';

  const dayStart = `${date}T00:00`;
  const dayEnd = `${addDays(date, 1)}T00:00`;
  const busy = busyFor(calendar.id, dayStart, addMinutes(dayEnd, duration));
  const off = timeOffFor(biz.id, calendar.id, dayStart, dayEnd);
  const buffer = s.bufferMinutes || 0;
  const step = s.slotInterval || 30;

  const slots = [];
  for (const [from, to] of calendar.hours[weekdayKey(date)] ?? []) {
    for (let m = toMin(from); m + duration <= toMin(to); m += step) {
      const start = `${date}T${fromMin(m)}`;
      const end = addMinutes(start, duration);
      if (start < earliest) continue;
      if (off.some((o) => overlaps(start, end, o.start_at, o.end_at))) continue;
      const taken = busy.filter((b) => overlaps(start, addMinutes(end, buffer), b.start_at, addMinutes(b.end_at, buffer))).length;
      const spots = calendar.capacity - taken;
      if (spots > 0) slots.push({ time: fromMin(m), spots });
    }
  }
  return slots;
}

/* ───────── appointment input ───────── */

/**
 * Validates an appointment payload against a business. Returns the row values.
 * `isStaff` relaxes the rules: staff can book any time, set duration and status.
 */
export function buildAppointment(biz, body, { isStaff, existing, patientScope = ALL } = {}) {
  const calendarId = int(body.calendarId ?? existing?.calendarId, 1, Number.MAX_SAFE_INTEGER, 0);
  const calendar = toCalendar(get('SELECT * FROM calendars WHERE id = ? AND business_id = ?', calendarId, biz.id));
  if (!calendar) fail(400, 'invalid_calendar');
  if (!isStaff && !calendar.active) fail(400, 'invalid_calendar');

  let service = null;
  const serviceId = body.serviceId === undefined ? existing?.serviceId : body.serviceId;
  if (serviceId) {
    service = toService(get('SELECT * FROM services WHERE id = ? AND business_id = ?', serviceId, biz.id));
    if (!service || (!isStaff && !service.active)) fail(400, 'invalid_service');
    if (service.calendarIds.length && !service.calendarIds.includes(calendar.id)) fail(400, 'service_not_offered');
  }

  const date = body.date ?? existing?.start.slice(0, 10);
  const time = body.time ?? existing?.start.slice(11);
  if (!DATE_RE.test(date || '') || !TIME_RE.test(time || '')) fail(400, 'invalid_datetime');
  const start = `${date}T${time}`;

  // staff may type any duration; an edit that keeps the service keeps its length; otherwise derive it
  let duration;
  if (isStaff && body.duration) duration = int(body.duration, 5, 1440, 30);
  else if (existing && body.serviceId === undefined) duration = diffMinutes(existing.start, existing.end);
  else duration = resolveDuration(biz, calendar, service);
  const end = addMinutes(start, duration);

  const s = biz.settings;
  const pick = (k, fallback = '') => (body[k] !== undefined ? body[k] : existing?.[k] ?? fallback);
  const clientName = str(pick('clientName'), 120);
  const clientEmail = str(pick('clientEmail'), 160);
  const clientPhone = str(pick('clientPhone'), 40);
  if (!clientName) fail(400, 'name_required');
  if (clientEmail && !isEmail(clientEmail)) fail(400, 'invalid_email');
  if (!isStaff && s.requirePhone && !clientPhone) fail(400, 'phone_required');
  if (!isStaff && s.requireEmail && !clientEmail) fail(400, 'email_required');

  // custom booking-form fields
  const customIn = body.custom ?? existing?.custom ?? {};
  const custom = {};
  for (const f of s.customFields) {
    const v = customIn[f.id];
    if (f.type === 'checkbox') custom[f.id] = !!v;
    else if (v !== undefined && v !== null && String(v).trim() !== '') custom[f.id] = str(String(v), 2000);
    if (!isStaff && f.required && (f.type === 'checkbox' ? !custom[f.id] : custom[f.id] === undefined)) {
      fail(400, 'field_required', { field: f.label });
    }
    if (f.type === 'select' && custom[f.id] !== undefined && !f.options.includes(custom[f.id])) delete custom[f.id];
  }

  const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
  const status = isStaff && STATUSES.includes(body.status) ? body.status : existing?.status ?? 'confirmed';

  // patient: staff may pick one they may already open; otherwise it is matched or created when saving.
  // (Without the scope check a doctor could book any patient into their own calendar and so open their file.)
  let patientId = existing?.patientId ?? null;
  if (isStaff && body.patientId !== undefined) {
    patientId = body.patientId ? int(body.patientId, 1, Number.MAX_SAFE_INTEGER, 0) : null;
    const [scope, params] = patientScope;
    if (patientId && patientId !== existing?.patientId && !get(`SELECT 1 FROM patients p WHERE p.id = ? AND p.business_id = ? AND ${scope}`, patientId, biz.id, ...params))
      fail(400, 'patient_not_found');
  }

  // price: staff may type one; a new service sets its list price (less the patient's company discount)
  let price = existing?.price ?? null;
  const serviceChanged = !existing || (body.serviceId !== undefined && (body.serviceId || null) !== (existing.serviceId || null));
  if (isStaff && body.price !== undefined && body.price !== null && body.price !== '') price = Math.max(0, Math.round(Number(body.price) * 100) / 100) || 0;
  else if (isStaff && body.price === '') price = null;
  // (a new booking without a known patient gets its price once the patient is matched, in insertAppointment)
  else if (serviceChanged) price = patientId || existing ? listPrice(biz.id, service, patientId) : null;

  return {
    calendar,
    service,
    values: {
      calendar_id: calendar.id,
      service_id: service?.id ?? null,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      start_at: start,
      end_at: end,
      status,
      notes: str(pick('notes'), 4000),
      custom: JSON.stringify(custom),
      patient_id: patientId,
      price,
    },
  };
}

/* ───────── patients ───────── */

/** Last 9 digits of a phone number: "0722 123 456", "+40722123456" and "0040722123456" match. */
export const phoneKey = (phone) => String(phone ?? '').replace(/\D/g, '').slice(-9);

/** A service's price for one patient: the list price less their company's discount. */
export function listPrice(bizId, service, patientId) {
  if (service?.price == null) return null;
  const discount = patientId
    ? get('SELECT c.discount FROM patients p JOIN companies c ON c.id = p.company_id WHERE p.id = ? AND c.active = 1', patientId)?.discount ?? 0
    : 0;
  return Math.round(service.price * (100 - discount)) / 100;
}

/**
 * The patient a booking belongs to: the client account's own file, else same phone, else same email,
 * else a new patient file.
 * - `scope`: only files this user may already open are matched (a doctor typing a stranger's phone
 *   gets a new file, which reception can merge, not a way into the other file).
 * - `fill`: copy missing contact details into the matched file. Off for online bookings, where
 *   anybody can type anybody's phone.
 */
export function findOrCreatePatient(biz, { name, phone, email, userId = null }, createdBy = null, { scope = ALL, fill = true } = {}) {
  const key = phoneKey(phone);
  const [sql, params] = scope;
  const find = (cond, ...args) => get(`SELECT * FROM patients p WHERE p.business_id = ? AND ${cond} AND ${sql} ORDER BY p.id LIMIT 1`, biz.id, ...args, ...params);
  let row = userId ? find('p.user_id = ?', userId) : null;
  if (!row && key.length >= 6) row = find('p.phone_key = ?', key);
  if (!row && email) row = find('p.email = ? COLLATE NOCASE', email);
  if (row && !fill) return row.id;
  if (row) {
    // fill gaps the patient file does not know yet
    run(
      `UPDATE patients SET phone = CASE WHEN phone = '' THEN ? ELSE phone END, phone_key = CASE WHEN phone_key = '' THEN ? ELSE phone_key END,
       email = CASE WHEN email = '' THEN ? ELSE email END, user_id = COALESCE(user_id, ?) WHERE id = ?`,
      phone || '',
      key,
      email || '',
      userId,
      row.id,
    );
    return row.id;
  }
  return createPatient(biz, { name, phone, email, userId }, createdBy);
}

export function createPatient(biz, p, createdBy = null) {
  const { lastInsertRowid } = run(
    `INSERT INTO patients (business_id, company_id, user_id, name, phone, phone_key, email, birth_date, gender, id_number, address,
      medical, notes, source, consent, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    biz.id,
    p.companyId ?? null,
    p.userId ?? null,
    p.name,
    p.phone ?? '',
    phoneKey(p.phone),
    p.email ?? '',
    p.birthDate ?? '',
    p.gender ?? '',
    p.idNumber ?? '',
    p.address ?? '',
    p.medical ?? '',
    p.notes ?? '',
    p.source ?? '',
    p.consent ?? true,
    createdBy,
    p.createdAt ?? nowIn(biz.settings.timezone),
  );
  return Number(lastInsertRowid);
}

/** Older bookings were saved before patient files existed: give each one its patient. */
export function backfillPatients() {
  const rows = all('SELECT a.*, b.settings FROM appointments a JOIN businesses b ON b.id = a.business_id WHERE a.patient_id IS NULL ORDER BY a.start_at');
  if (!rows.length) return 0;
  tx(() => {
    for (const a of rows) {
      const biz = { id: a.business_id, settings: { ...DEFAULT_SETTINGS, ...parseJSON(a.settings, {}) } };
      const before = get('SELECT COUNT(*) AS n FROM patients WHERE business_id = ?', biz.id).n;
      const id = findOrCreatePatient(biz, { name: a.client_name, phone: a.client_phone, email: a.client_email, userId: a.client_id });
      // a patient created now is "new" from their first visit, not from today
      if (get('SELECT COUNT(*) AS n FROM patients WHERE business_id = ?', biz.id).n > before) {
        const first = a.start_at < nowIn(biz.settings.timezone) ? a.start_at : nowIn(biz.settings.timezone);
        run('UPDATE patients SET created_at = ? WHERE id = ?', first, id);
      }
      run('UPDATE appointments SET patient_id = ? WHERE id = ?', id, a.id);
    }
  });
  return rows.length;
}

/* ───────── notifications ───────── */

/** Records something the team should see in the bell (new online booking, cancellation...). */
export function notify(biz, { calendarId = null, appointmentId = null, kind, data = {}, actorId = null }) {
  run(
    'INSERT INTO notifications (business_id, calendar_id, appointment_id, kind, data, actor_id, created_at) VALUES (?,?,?,?,?,?,?)',
    biz.id,
    calendarId,
    appointmentId,
    kind,
    JSON.stringify(data),
    actorId,
    nowIn(biz.settings.timezone),
  );
}

/** Bookings or time off that collide with the given interval (used to warn staff). */
export function findConflicts(biz, calendar, start, end, excludeId = 0) {
  const buffer = biz.settings.bufferMinutes || 0;
  const busy = busyFor(calendar.id, addMinutes(start, -buffer - 1440), addMinutes(end, buffer + 1440), excludeId).filter((b) =>
    overlaps(start, addMinutes(end, buffer), b.start_at, addMinutes(b.end_at, buffer)),
  );
  const off = timeOffFor(biz.id, calendar.id, start, end);
  return { full: busy.length >= calendar.capacity, timeOff: off.length > 0 };
}

export function insertAppointment(biz, v, { clientId = null, source = 'staff', createdBy = null, patientScope = ALL } = {}) {
  const bizId = typeof biz === 'object' ? biz.id : biz;
  // every booking belongs to a patient file
  let patientId = v.patient_id ?? null;
  if (!patientId && typeof biz === 'object') {
    patientId = findOrCreatePatient(biz, { name: v.client_name, phone: v.client_phone, email: v.client_email, userId: clientId }, createdBy, {
      scope: patientScope,
      fill: source !== 'online',
    });
    if (v.price === undefined || v.price === null) {
      const service = v.service_id ? toService(get('SELECT * FROM services WHERE id = ?', v.service_id)) : null;
      v = { ...v, price: listPrice(bizId, service, patientId) };
    }
  }
  const { lastInsertRowid } = run(
    `INSERT INTO appointments (business_id, calendar_id, service_id, client_id, client_name, client_email, client_phone,
      start_at, end_at, status, notes, custom, source, patient_id, price) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    bizId,
    v.calendar_id,
    v.service_id,
    clientId,
    v.client_name,
    v.client_email,
    v.client_phone,
    v.start_at,
    v.end_at,
    v.status,
    v.notes,
    v.custom,
    source,
    patientId,
    v.price ?? null,
  );
  return toAppointment(get('SELECT * FROM appointments WHERE id = ?', lastInsertRowid));
}

export { isColor };
