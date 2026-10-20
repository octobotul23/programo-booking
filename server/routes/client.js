import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireUser } from '../auth.js';
import { toBusiness, toClientAppointment, notify } from '../model.js';
import { addMinutes, nowIn } from '../time.js';
import { fail } from '../util.js';

const r = Router();
r.use(requireUser);

// Appointments booked by this client account (by account id only: emails are not verified)
r.get('/appointments', (req, res) => {
  const rows = all(
    `SELECT a.*, b.name AS business_name, b.slug AS business_slug, b.phone AS business_phone, b.address AS business_address,
       c.name AS calendar_name, c.color AS calendar_color, s.name AS service_name
     FROM appointments a
     JOIN businesses b ON b.id = a.business_id
     JOIN calendars c ON c.id = a.calendar_id
     LEFT JOIN services s ON s.id = a.service_id
     WHERE a.client_id = ?
     ORDER BY a.start_at DESC LIMIT 500`,
    req.user.id,
  );
  res.json(
    rows.map((row) => ({
      ...toClientAppointment(row),
      business: { name: row.business_name, slug: row.business_slug, phone: row.business_phone, address: row.business_address },
      calendarName: row.calendar_name,
      calendarColor: row.calendar_color,
      serviceName: row.service_name,
    })),
  );
});

r.post('/appointments/:aid/cancel', (req, res) => {
  const row = get(
    `SELECT * FROM appointments WHERE id = ? AND client_id = ?`,
    req.params.aid,
    req.user.id,
  );
  if (!row) fail(404, 'appointment_not_found');
  if (!['pending', 'confirmed'].includes(row.status)) fail(400, 'cannot_cancel');
  const biz = toBusiness(get('SELECT * FROM businesses WHERE id = ?', row.business_id));
  if (!biz.settings.allowClientCancel) fail(403, 'cancel_not_allowed');
  const limit = addMinutes(nowIn(biz.settings.timezone), biz.settings.cancelHours * 60);
  if (row.start_at < limit) fail(403, 'too_late_to_cancel', { hours: biz.settings.cancelHours });
  run("UPDATE appointments SET status = 'cancelled' WHERE id = ?", row.id);
  notify(biz, { calendarId: row.calendar_id, appointmentId: row.id, kind: 'client_cancelled', actorId: req.user.id, data: { clientName: row.client_name, start: row.start_at } });
  res.json({ ok: true });
});

export default r;
