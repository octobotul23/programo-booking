import { Router } from 'express';
import { all, get } from '../db.js';
import { buildAppointment, getSlots, insertAppointment,
  notify, listCalendars, listServices, resolveDuration, toBusiness, toClientAppointment, toService } from '../model.js';
import { PRESETS } from '../presets.js';
import { DATE_RE, addDays, nowIn } from '../time.js';
import { fail, str } from '../util.js';

const r = Router();

// What a visitor may see about a business (no owner data, no internal notes)
const publicView = (b) => {
  const s = b.settings;
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    type: b.type,
    description: b.description,
    phone: b.phone,
    email: b.email,
    address: b.address,
    settings: {
      bookingMode: s.bookingMode,
      requireApproval: s.requireApproval,
      requireAccount: s.requireAccount,
      requirePhone: s.requirePhone,
      requireEmail: s.requireEmail,
      allowClientCancel: s.allowClientCancel,
      cancelHours: s.cancelHours,
      maxDaysAhead: s.maxDaysAhead,
      timezone: s.timezone,
      currency: s.currency,
      showPrices: s.showPrices,
      calendarLabel: s.calendarLabel,
      clientLabel: s.clientLabel,
      weekStart: s.weekStart,
      welcomeMessage: s.welcomeMessage,
      customFields: s.customFields,
    },
  };
};

const loadBySlug = (slug) => {
  const b = toBusiness(get('SELECT * FROM businesses WHERE slug = ?', String(slug)));
  if (!b) fail(404, 'business_not_found');
  return b;
};

/** Starting calendars per business type, for the onboarding screen. */
r.get('/presets', (_req, res) => {
  res.json(Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, p.calendars.map((c) => ({ name: c.name, capacity: c.capacity ?? 1 }))])));
});

/** Directory of businesses that accept online bookings. */
r.get('/businesses', (req, res) => {
  const q = `%${str(req.query.q, 80)}%`;
  const rows = all(
    `SELECT * FROM businesses WHERE (name LIKE ? OR address LIKE ? OR type LIKE ?) ORDER BY name LIMIT 100`,
    q,
    q,
    q,
  )
    .map(toBusiness)
    .filter((b) => b.settings.bookingMode === 'public')
    .map((b) => ({ id: b.id, name: b.name, slug: b.slug, type: b.type, address: b.address, description: b.description }));
  res.json(rows);
});

r.get('/b/:slug', (req, res) => {
  const b = loadBySlug(req.params.slug);
  const hideServicePrice = (s) => (b.settings.showPrices ? s : { ...s, price: null });
  res.json({
    ...publicView(b),
    today: nowIn(b.settings.timezone).slice(0, 10),
    calendars: listCalendars(b.id, true).map(({ id, name, description, color, capacity }) => ({ id, name, description, color, capacity })),
    services: listServices(b.id, true).map(hideServicePrice),
  });
});

r.get('/b/:slug/availability', (req, res) => {
  const b = loadBySlug(req.params.slug);
  if (b.settings.bookingMode !== 'public') fail(403, 'booking_disabled');
  const calendar = listCalendars(b.id, true).find((c) => c.id === Number(req.query.calendarId));
  if (!calendar) fail(400, 'invalid_calendar');
  const service = req.query.serviceId ? toService(get('SELECT * FROM services WHERE id = ? AND business_id = ? AND active = 1', req.query.serviceId, b.id)) : null;
  const duration = resolveDuration(b, calendar, service);

  // single day, or a range for the date strip (?from=&days=)
  if (DATE_RE.test(req.query.date || '')) return res.json(getSlots(b, calendar, req.query.date, duration));
  if (DATE_RE.test(req.query.from || '')) {
    const days = Math.min(Number(req.query.days) || 14, 42);
    const out = {};
    for (let i = 0; i < days; i++) {
      const d = addDays(req.query.from, i);
      out[d] = getSlots(b, calendar, d, duration).length;
    }
    return res.json(out);
  }
  fail(400, 'invalid_datetime');
});

r.post('/b/:slug/book', (req, res) => {
  const b = loadBySlug(req.params.slug);
  const s = b.settings;
  if (s.bookingMode !== 'public') fail(403, 'booking_disabled');
  if (s.requireAccount && !req.user) fail(401, 'account_required');

  // Fill contact details from the account when the client is logged in
  const body = { ...req.body };
  if (req.user) {
    body.clientName ||= req.user.name;
    body.clientEmail ||= req.user.email;
    body.clientPhone ||= req.user.phone;
  }
  const { calendar, service, values } = buildAppointment(b, body, { isStaff: false });

  // The slot must still be on offer (hours, notice, horizon, capacity)
  const date = values.start_at.slice(0, 10);
  const slots = getSlots(b, calendar, date, resolveDuration(b, calendar, service));
  if (!slots.some((x) => x.time === values.start_at.slice(11))) fail(409, 'slot_taken');

  values.status = s.requireApproval ? 'pending' : 'confirmed';
  const appt = insertAppointment(b, values, { clientId: req.user?.role === 'client' ? req.user.id : null, source: 'online' });
  notify(b, {
    calendarId: appt.calendarId,
    appointmentId: appt.id,
    kind: appt.status === 'pending' ? 'online_request' : 'online_booking',
    data: { clientName: appt.clientName, start: appt.start },
  });
  // only what the visitor typed and the time: nothing that hints whether this phone is already a patient here
  res.status(201).json(toClientAppointment(get('SELECT * FROM appointments WHERE id = ?', appt.id)));
});

export default r;
