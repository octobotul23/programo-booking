import { all, get, run } from './db.js';
import { toBusiness } from './model.js';
import { addMinutes, nowIn } from './time.js';
import { parseJSON } from './util.js';
import { seal, unseal } from './security.js';

/*
  SMS & WhatsApp. Two ways to send:
  - "manual" (free, no account): the app writes the message and opens WhatsApp / the phone's SMS app
    with it filled in (wa.me and sms: links); the person presses Send.
  - "twilio": the server sends it through the business's own Twilio account (SMS and WhatsApp),
    which also makes automatic reminders possible.
*/

export const DEFAULT_TEMPLATES = {
  en: {
    reminder: 'Hello {name}, a reminder of your appointment at {business} on {date} at {time} with {doctor}. Reply to this message if you cannot come.',
    confirmation: 'Hello {name}, your appointment at {business} is booked for {date} at {time} with {doctor}. See you!',
    custom: 'Hello {name}, ',
  },
  ro: {
    reminder: 'Bună ziua, {name}! Vă reamintim programarea la {business} pe {date}, ora {time}, cu {doctor}. Răspundeți la acest mesaj dacă nu puteți ajunge.',
    confirmation: 'Bună ziua, {name}! Programarea la {business} a fost înregistrată pentru {date}, ora {time}, cu {doctor}. Vă așteptăm!',
    custom: 'Bună ziua, {name}! ',
  },
};

// the provider token is stored encrypted (see security.js); everything else reads it in clear
export const getIntegration = (bizId) => {
  const data = parseJSON(get('SELECT data FROM integrations WHERE business_id = ?', bizId)?.data, {});
  return data.twilioToken ? { ...data, twilioToken: unseal(data.twilioToken) } : data;
};

export function saveIntegration(bizId, data) {
  run(
    'INSERT INTO integrations (business_id, data) VALUES (?, ?) ON CONFLICT(business_id) DO UPDATE SET data = excluded.data',
    bizId,
    JSON.stringify(data.twilioToken ? { ...data, twilioToken: seal(data.twilioToken) } : data),
  );
}

export const twilioReady = (i) => !!(i.provider === 'twilio' && i.twilioSid && i.twilioToken && (i.smsFrom || i.whatsappFrom));

/** Digits in international form without "+": "0722 123 456" → "40722123456" (default country Romania). */
export function intlPhone(phone, countryCode = '40') {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (String(phone).trim().startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return countryCode + d.slice(1);
  return d;
}

/** Link that opens the message ready to send, in WhatsApp or the SMS app. */
export function manualLink(channel, phone, body, countryCode) {
  const to = intlPhone(phone, countryCode);
  const text = encodeURIComponent(body);
  return channel === 'whatsapp' ? `https://wa.me/${to}?text=${text}` : `sms:+${to}?&body=${text}`;
}

/** Fills {name}, {date}, {time}, {doctor}, {service}, {business}, {address}, {phone}. */
export function renderTemplate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

export function templateFor(biz, kind, lang) {
  const t = biz.settings.messaging?.templates?.[kind];
  return t || DEFAULT_TEMPLATES[lang === 'ro' ? 'ro' : 'en'][kind] || '';
}

/** Template variables for an appointment (and its patient). */
export function appointmentVars(biz, appt, lang) {
  const cal = appt ? get('SELECT name FROM calendars WHERE id = ?', appt.calendar_id ?? appt.calendarId) : null;
  const svcId = appt?.service_id ?? appt?.serviceId;
  const svc = svcId ? get('SELECT name FROM services WHERE id = ?', svcId) : null;
  const start = appt?.start_at ?? appt?.start;
  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB';
  return {
    name: appt?.client_name ?? appt?.clientName ?? '',
    date: start ? new Date(`${start.slice(0, 10)}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '',
    time: start ? start.slice(11, 16) : '',
    doctor: cal?.name ?? '',
    service: svc?.name ?? '',
    business: biz.name,
    address: biz.address,
    phone: biz.phone,
  };
}

/** Sends through Twilio. Returns { ok, error }. */
export async function sendViaTwilio(integration, channel, phone, body, countryCode) {
  const to = `+${intlPhone(phone, countryCode)}`;
  const from = channel === 'whatsapp' ? integration.whatsappFrom : integration.smsFrom;
  if (!from) return { ok: false, error: channel === 'whatsapp' ? 'No WhatsApp sender number set' : 'No SMS sender set' };
  const params = new URLSearchParams({
    From: channel === 'whatsapp' ? `whatsapp:${from.startsWith('+') ? from : `+${from}`}` : from,
    To: channel === 'whatsapp' ? `whatsapp:${to}` : to,
    Body: body,
  });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(integration.twilioSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${integration.twilioSid}:${integration.twilioToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.message || `Twilio error ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message || 'network error' };
  }
}

export function logMessage(biz, m) {
  const { lastInsertRowid } = run(
    `INSERT INTO messages (business_id, patient_id, appointment_id, channel, kind, to_phone, body, status, error, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    biz.id,
    m.patientId ?? null,
    m.appointmentId ?? null,
    m.channel,
    m.kind ?? 'custom',
    m.toPhone,
    m.body,
    m.status,
    m.error ?? '',
    m.createdBy ?? null,
    nowIn(biz.settings.timezone),
  );
  return Number(lastInsertRowid);
}

/* ───────── automatic reminders ───────── */

async function sendDueReminders() {
  for (const row of all('SELECT b.*, u.lang AS owner_lang FROM businesses b JOIN users u ON u.id = b.owner_id')) {
    const biz = toBusiness(row);
    const m = biz.settings.messaging;
    if (!m?.autoReminder) continue;
    const integration = getIntegration(biz.id);
    if (!twilioReady(integration)) continue;
    const now = nowIn(biz.settings.timezone);
    const due = all(
      `SELECT a.* FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id
       WHERE a.business_id = ? AND a.status IN ('confirmed', 'pending') AND a.client_phone != ''
         AND a.start_at > ? AND a.start_at <= ? AND COALESCE(p.consent, 1) = 1
         AND NOT EXISTS (SELECT 1 FROM messages x WHERE x.appointment_id = a.id AND x.kind = 'reminder')
       LIMIT 50`,
      biz.id,
      now,
      addMinutes(now, (m.reminderHours || 24) * 60),
    );
    for (const a of due) {
      const body = renderTemplate(templateFor(biz, 'reminder', row.owner_lang), appointmentVars(biz, a, row.owner_lang));
      const channel = m.channel === 'sms' ? 'sms' : 'whatsapp';
      const result = await sendViaTwilio(integration, channel, a.client_phone, body, m.countryCode);
      logMessage(biz, {
        patientId: a.patient_id,
        appointmentId: a.id,
        channel,
        kind: 'reminder',
        toPhone: a.client_phone,
        body,
        status: result.ok ? 'sent' : 'failed',
        error: result.error,
      });
    }
  }
}

export function startReminderLoop() {
  const tick = () => sendDueReminders().catch((e) => console.error('reminders:', e.message));
  setTimeout(tick, 15_000);
  setInterval(tick, 5 * 60_000).unref();
}
