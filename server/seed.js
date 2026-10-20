// Demo data so the app has something to look at: `npm run seed`
//
//   Business owner  demo@programo.test   / demo1234
//   Client          client@programo.test / demo1234
//   Staff (doctor)  elena@programo.test  / demo1234  (sees only her own calendar)
//
// Safe to run twice: it stops if the demo owner already exists.
// `npm run seed -- --reset` deletes the demo accounts (and their business) first.
// Never run this on a live server: the demo accounts have a published password.
import './env.js'; // first: NODE_ENV=production in .env must stop it too
import { get, run, tx } from './db.js';
import { hashPassword } from './auth.js';
import { createBusiness, createPatient, insertAppointment, listCalendars, listPrice, listServices, toBusiness } from './model.js';
import { addDays, addMinutes, nowIn } from './time.js';

const PASSWORD = 'demo1234';

// the Docker image runs with NODE_ENV=production: demo accounts there would be an open door
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--on-live-server')) {
  console.error('Refusing to add demo accounts on a live server (NODE_ENV=production).');
  process.exit(1);
}

const DEMO = ['demo@programo.test', 'client@programo.test', 'elena@programo.test'];
if (process.argv.includes('--reset')) run(`DELETE FROM users WHERE email IN (?, ?, ?)`, ...DEMO);

if (get('SELECT id FROM users WHERE email = ?', DEMO[0])) {
  console.log('Demo data already present.');
  process.exit(0);
}

const user = (email, name, phone, role) =>
  Number(run('INSERT INTO users (email, password_hash, name, phone, role, lang) VALUES (?, ?, ?, ?, ?, ?)', email, hashPassword(PASSWORD), name, phone, role, 'ro').lastInsertRowid);

// same numbers on every run, so the demo looks the same each time
let seed = 20261020;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];

// obviously fictional numbers (0700 000 1xx) so a test message never reaches a real person
const phoneOf = (i) => `0700 000 ${100 + i}`;
const intl = (phone) => `40${phone.replace(/\D/g, '').slice(1)}`;

const PATIENTS = [
  { name: 'Ioana Rusu', gender: 'f', birthDate: '1988-04-12', company: 'vita', source: 'recommendation', medical: 'Alergie la penicilină' },
  { name: 'George Stan', gender: 'm', birthDate: '1975-11-03', company: 'tech', source: 'google' },
  { name: 'Maria Dobre', gender: 'f', birthDate: '1992-07-21', source: 'facebook' },
  { name: 'Radu Pop', gender: 'm', birthDate: '1969-02-28', company: 'vita', source: 'recommendation', medical: 'Diabet zaharat tip 2' },
  { name: 'Elena Ilie', gender: 'f', birthDate: '2001-09-15', source: 'instagram' },
  { name: 'Vlad Matei', gender: 'm', birthDate: '1983-05-30', company: 'tech', source: 'website' },
  { name: 'Cristina Neagu', gender: 'f', birthDate: '1979-12-08', source: 'google' },
  { name: 'Paul Toma', gender: 'm', birthDate: '1995-03-17', source: 'walkIn', consent: false },
  { name: 'Andreea Lupu', gender: 'f', birthDate: '1990-01-25', company: 'tech', source: 'website' },
  { name: 'Bogdan Sava', gender: 'm', birthDate: '1958-06-11', source: 'recommendation', medical: 'Hipertensiune; ia anticoagulante' },
  { name: 'Diana Moraru', gender: 'f', birthDate: '1986-10-02', source: 'facebook' },
  { name: 'Sorin Barbu', gender: 'm', birthDate: '1972-08-19', company: 'old', source: 'google' },
  { name: 'Teodora Cazacu', gender: 'f', birthDate: '2004-04-04', source: 'instagram' },
  { name: 'Florin Dumitru', gender: 'm', birthDate: '1966-12-30', company: 'vita', source: 'recommendation' },
  { name: 'Larisa Pană', gender: 'f', birthDate: '1998-02-14', source: 'website' },
];

const NOTES = {
  diagnosis: ['Rinofaringită acută', 'Hipertensiune arterială esențială, controlată', 'Lombalgie mecanică', 'Gastrită cronică', 'Dermatită de contact', 'Anemie feriprivă ușoară'],
  treatment: ['Repaus 3 zile, hidratare, paracetamol la nevoie', 'Kinetoterapie 10 ședințe', 'Pansament local, reevaluare în 7 zile', 'Regim alimentar și tratament conform rețetei'],
  prescription: ['Ibuprofen 400 mg — 1 cp la 8 ore, 5 zile', 'Omeprazol 20 mg — 1 cp dimineața, 4 săptămâni', 'Fier 100 mg — 1 cp pe zi, 3 luni', 'Cremă cu hidrocortizon 1% — de 2 ori pe zi, 7 zile'],
  recommendation: ['Control peste 3 săptămâni, cu analize', 'Ecografie abdominală', 'Dietă hiposodată, mișcare zilnică 30 de minute', 'Revine dacă febra persistă peste 3 zile'],
  note: ['Acuză oboseală de aproximativ două săptămâni.', 'TA 135/85 mmHg, puls 72/min.', 'Analizele aduse sunt în limite normale.', 'Stare generală bună, evoluție favorabilă.'],
};
// the coloured type badge already says "Diagnosis"; a title is only worth it when it adds something
const TITLES = { note: 'Consultație', treatment: 'Plan de tratament' };

tx(() => {
  const ownerId = user('demo@programo.test', 'Ana Popescu', '0700 000 001', 'business');
  const clientId = user('client@programo.test', 'Mihai Ionescu', '0700 000 002', 'client');

  const bizId = createBusiness(ownerId, {
    name: 'Clinica Aurora',
    type: 'clinic',
    lang: 'ro',
    calendars: [{ name: 'Dr. Elena Marin' }, { name: 'Dr. Andrei Vlad' }],
    bookingMode: 'public',
    requireApproval: false,
  });
  run(
    'UPDATE businesses SET description = ?, phone = ?, address = ?, email = ? WHERE id = ?',
    'Medicină de familie și consultații de specialitate, în centrul orașului.',
    '0264 555 010',
    'Str. Memorandumului 12, Cluj-Napoca',
    'contact@aurora.test',
    bizId,
  );
  run("INSERT INTO services (business_id, name, duration, price, position) VALUES (?, 'Ecografie', 30, 250, 3)", bizId);
  const biz = toBusiness(get('SELECT * FROM businesses WHERE id = ?', bizId));
  const tz = biz.settings.timezone;
  const now = nowIn(tz);
  const today = now.slice(0, 10);
  const cals = listCalendars(bizId);
  const svcs = listServices(bizId);

  // Dr. Marin has her own login and sees only her calendar
  const staffId = user('elena@programo.test', 'Dr. Elena Marin', '0700 000 003', 'staff');
  run(
    "INSERT INTO members (business_id, user_id, name, email, access, calendar_ids) VALUES (?, ?, ?, ?, 'own', ?)",
    bizId,
    staffId,
    'Dr. Elena Marin',
    'elena@programo.test',
    JSON.stringify([cals[0].id]),
  );

  // insurers and corporate contracts
  const company = (name, taxId, discount, contact, active = 1) =>
    Number(
      run(
        'INSERT INTO companies (business_id, name, tax_id, discount, contact, phone, email, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        bizId,
        name,
        taxId,
        discount,
        contact,
        '0264 555 2' + String(Math.round(discount)).padStart(2, '0'),
        `contact@${name.split(' ')[0].toLowerCase()}.test`,
        active,
      ).lastInsertRowid,
    );
  const companies = {
    vita: company('Vita Asigurări', 'RO18273645', 10, 'Laura Dinu'),
    tech: company('Nordic Tech SRL', 'RO40112233', 15, 'Andrei Pavel'),
    old: company('Medisan Corporate', 'RO30998877', 5, '', 0),
  };

  const patients = PATIENTS.map((p, i) => ({
    ...p,
    phone: phoneOf(i),
    email: `${p.name.split(' ')[0].toLowerCase()}@example.test`,
    id: createPatient(
      biz,
      {
        name: p.name,
        phone: phoneOf(i),
        email: `${p.name.split(' ')[0].toLowerCase()}@example.test`,
        birthDate: p.birthDate,
        gender: p.gender,
        companyId: p.company ? companies[p.company] : null,
        source: p.source,
        medical: p.medical ?? '',
        consent: p.consent ?? true,
        address: 'Cluj-Napoca',
      },
      ownerId,
    ),
    // patients "arrive" over the six weeks, so the dashboard shows new patients every month
    from: -45 + i * 3,
  }));

  const HOURS = ['08:00', '09:00', '10:00', '11:00', '13:30', '14:30', '15:30', '16:30'];
  const booked = [];
  for (let d = -45; d <= 10; d++) {
    const date = addDays(today, d);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const [ci, cal] of cals.entries()) {
      const pool = patients.filter((p) => p.from <= d);
      if (!pool.length) continue;
      const count = 2 + Math.floor(rand() * 4);
      const hours = HOURS.filter(() => rand() < count / HOURS.length);
      for (const hour of hours) {
        const p = pick(pool);
        const svc = ci === 1 && rand() < 0.3 ? svcs[3] ?? svcs[0] : svcs[Math.floor(rand() * Math.min(3, svcs.length))];
        const start = `${date}T${hour}`;
        const end = addMinutes(start, svc.duration);
        const past = end <= now;
        const r = rand();
        const status = past ? (r < 0.8 ? 'completed' : r < 0.9 ? 'cancelled' : 'no_show') : r < 0.8 ? 'confirmed' : r < 0.9 ? 'pending' : 'cancelled';
        const source = status === 'pending' || rand() < 0.2 ? 'online' : 'staff';
        const appt = insertAppointment(
          biz,
          {
            calendar_id: cal.id,
            service_id: svc.id,
            client_name: p.name,
            client_email: p.email,
            client_phone: p.phone,
            start_at: start,
            end_at: end,
            status,
            notes: '',
            custom: '{}',
            patient_id: p.id,
            price: listPrice(bizId, svc, p.id),
          },
          { source, createdBy: source === 'online' ? null : ci === 0 ? staffId : ownerId },
        );
        booked.push({ ...appt, ci, patient: p });
      }
    }
  }

  // money: most completed visits are paid, some partly, a few not at all
  const pay = (a, amount, method, at, note = '') =>
    run(
      'INSERT INTO payments (business_id, patient_id, appointment_id, amount, method, note, paid_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      bizId,
      a?.patient.id ?? null,
      a?.id ?? null,
      amount,
      method,
      note,
      at,
      ownerId,
    );
  const done = booked.filter((a) => a.status === 'completed' && a.price);
  for (const a of done) {
    const r = rand();
    const method = a.patient.company && rand() < 0.4 ? 'transfer' : rand() < 0.5 ? 'cash' : 'card';
    if (r < 0.85) pay(a, a.price, method, a.end);
    else if (r < 0.93) pay(a, Math.round(a.price / 2), method, a.end, 'Avans');
  }
  const refund = done.find((a) => a.patient.name === 'Maria Dobre');
  if (refund) pay(refund, -50, 'cash', addMinutes(refund.end, 30), 'Restituire parțială');
  pay({ id: null, patient: patients[9] }, 300, 'card', `${addDays(today, -2)}T12:10`, 'Avans pachet analize');

  // the medical file: what the doctor wrote at the visit
  for (const a of done) {
    if (rand() > 0.45) continue;
    for (const kind of rand() < 0.5 ? ['diagnosis', 'prescription'] : [pick(['note', 'treatment', 'recommendation'])]) {
      run(
        'INSERT INTO records (business_id, patient_id, appointment_id, calendar_id, kind, title, body, author_id, author_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        bizId,
        a.patient.id,
        a.id,
        a.calendarId,
        kind,
        TITLES[kind] ?? '',
        pick(NOTES[kind]),
        a.ci === 0 ? staffId : null,
        cals[a.ci].name,
        a.end,
      );
    }
  }

  // reminders already sent for today's and tomorrow's visits (by tapping "Open WhatsApp")
  const tomorrow = addDays(today, 1);
  for (const a of booked) {
    const day = a.start.slice(0, 10);
    if ((day !== today && day !== tomorrow) || a.status === 'cancelled' || a.patient.consent === false || rand() < 0.35) continue;
    run(
      "INSERT INTO messages (business_id, patient_id, appointment_id, channel, kind, to_phone, body, status, created_by, created_at) VALUES (?, ?, ?, 'whatsapp', 'reminder', ?, ?, 'manual', ?, ?)",
      bizId,
      a.patient.id,
      a.id,
      intl(a.patient.phone),
      `Bună ziua, ${a.patient.name}! Vă reamintim programarea la Clinica Aurora pe ${day.split('-').reverse().join('.')}, ora ${a.start.slice(11)}.`,
      ownerId,
      `${addDays(day, -1)}T17:${String(10 + Math.floor(rand() * 40)).padStart(2, '0')}`,
    );
  }

  // the bell: what happened recently
  const bell = (a, kind, at, actorId = null, extra = {}) =>
    run(
      'INSERT INTO notifications (business_id, calendar_id, appointment_id, kind, data, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      bizId,
      a.calendarId,
      a.id,
      kind,
      JSON.stringify({ clientName: a.clientName, start: a.start, ...extra }),
      actorId,
      at,
    );
  const future = booked.filter((a) => a.start > now);
  future.filter((a) => a.status === 'pending').slice(0, 3).forEach((a, i) => bell(a, 'online_request', addMinutes(now, -40 - i * 95)));
  future.filter((a) => a.source === 'online' && a.status === 'confirmed').slice(0, 2).forEach((a, i) => bell(a, 'online_booking', addMinutes(now, -300 - i * 600)));
  future.filter((a) => a.status === 'cancelled').slice(0, 1).forEach((a) => bell(a, 'client_cancelled', addMinutes(now, -1500)));
  future.filter((a) => a.ci === 0 && a.status === 'confirmed').slice(2, 4).forEach((a, i) => bell(a, 'booked', addMinutes(now, -2900 - i * 300), staffId));

  // one upcoming booking for the demo client account
  const start = `${addDays(today, 2)}T11:30`;
  const mine = insertAppointment(
    biz,
    { calendar_id: cals[0].id, service_id: svcs[0].id, client_name: 'Mihai Ionescu', client_email: 'client@programo.test', client_phone: '0700 000 002', start_at: start, end_at: addMinutes(start, svcs[0].duration), status: 'confirmed', notes: '', custom: '{}' },
    { clientId, source: 'online' },
  );
  bell(mine, 'online_booking', addMinutes(now, -12));

  // a patient file is "new" from its first visit
  run(
    `UPDATE patients SET created_at = MIN(?, COALESCE((SELECT MIN(a.start_at) FROM appointments a WHERE a.patient_id = patients.id), ?)) WHERE business_id = ?`,
    now,
    now,
    bizId,
  );

  console.log(`Seeded "Clinica Aurora": ${booked.length + 1} appointments, ${patients.length + 1} patients, ${done.length} completed visits. Logins are listed at the top of server/seed.js.`);
});
