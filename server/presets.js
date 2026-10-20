// Starting points per business type. Everything here is editable later in Settings.

export const PALETTE = ['#c9a96e', '#a9a4e6', '#8fd6b0', '#f3b8a0', '#b8c9ff', '#e2cc9c', '#f2460d', '#9d98d6'];

const weekdays = (from, to) => ({ mon: [[from, to]], tue: [[from, to]], wed: [[from, to]], thu: [[from, to]], fri: [[from, to]], sat: [], sun: [] });
const withSat = (from, to, satFrom, satTo) => ({ ...weekdays(from, to), sat: [[satFrom, satTo]] });
const everyDay = (from, to) => ({ ...weekdays(from, to), sat: [[from, to]], sun: [[from, to]] });

// With a lunch break: two intervals per day
const clinicHours = () => {
  const d = [['08:00', '12:30'], ['13:30', '17:00']];
  return { mon: d, tue: d, wed: d, thu: d, fri: d, sat: [], sun: [] };
};

export const PRESETS = {
  clinic: {
    calendars: [{ name: { en: 'Doctor 1', ro: 'Medic 1' } }, { name: { en: 'Doctor 2', ro: 'Medic 2' } }],
    hours: clinicHours,
    services: [
      { name: { en: 'Consultation', ro: 'Consultație' }, duration: 30, price: 200 },
      { name: { en: 'Follow-up visit', ro: 'Control' }, duration: 20, price: 120 },
      { name: { en: 'Extended consultation', ro: 'Consultație extinsă' }, duration: 60, price: 350 },
    ],
  },
  dental: {
    calendars: [{ name: { en: 'Dentist 1', ro: 'Medic dentist 1' } }, { name: { en: 'Hygienist', ro: 'Igienist' } }],
    hours: () => weekdays('09:00', '18:00'),
    services: [
      { name: { en: 'Check-up', ro: 'Consult' }, duration: 30, price: 150 },
      { name: { en: 'Cleaning', ro: 'Igienizare' }, duration: 45, price: 250 },
      { name: { en: 'Filling', ro: 'Obturație' }, duration: 60, price: 400 },
    ],
  },
  gym: {
    calendars: [
      { name: { en: 'Personal trainer', ro: 'Antrenor personal' } },
      { name: { en: 'Group classes', ro: 'Clase de grup' }, capacity: 12 },
    ],
    hours: () => everyDay('07:00', '21:00'),
    services: [
      { name: { en: 'Personal training', ro: 'Antrenament personal' }, duration: 60, price: 150 },
      { name: { en: 'Group class', ro: 'Clasă de grup' }, duration: 60, price: 50 },
      { name: { en: 'Fitness assessment', ro: 'Evaluare fitness' }, duration: 30, price: 0 },
    ],
  },
  salon: {
    calendars: [{ name: { en: 'Stylist 1', ro: 'Stilist 1' } }, { name: { en: 'Stylist 2', ro: 'Stilist 2' } }],
    hours: () => withSat('09:00', '19:00', '09:00', '15:00'),
    services: [
      { name: { en: 'Haircut', ro: 'Tuns' }, duration: 30, price: 80 },
      { name: { en: 'Colouring', ro: 'Vopsit' }, duration: 90, price: 250 },
      { name: { en: 'Blow-dry', ro: 'Coafat' }, duration: 45, price: 100 },
    ],
  },
  spa: {
    calendars: [{ name: { en: 'Therapist 1', ro: 'Terapeut 1' } }, { name: { en: 'Room 2', ro: 'Camera 2' } }],
    hours: () => everyDay('10:00', '20:00'),
    services: [
      { name: { en: 'Relaxing massage', ro: 'Masaj de relaxare' }, duration: 60, price: 200 },
      { name: { en: 'Facial treatment', ro: 'Tratament facial' }, duration: 45, price: 180 },
    ],
  },
  physio: {
    calendars: [{ name: { en: 'Physiotherapist 1', ro: 'Kinetoterapeut 1' } }],
    hours: () => weekdays('08:00', '18:00'),
    services: [
      { name: { en: 'Evaluation', ro: 'Evaluare' }, duration: 45, price: 150 },
      { name: { en: 'Therapy session', ro: 'Ședință de terapie' }, duration: 50, price: 130 },
    ],
  },
  vet: {
    calendars: [{ name: { en: 'Vet 1', ro: 'Medic veterinar 1' } }],
    hours: () => withSat('09:00', '18:00', '09:00', '13:00'),
    services: [
      { name: { en: 'Consultation', ro: 'Consultație' }, duration: 30, price: 100 },
      { name: { en: 'Vaccination', ro: 'Vaccinare' }, duration: 15, price: 80 },
    ],
  },
  tutoring: {
    calendars: [{ name: { en: 'Teacher 1', ro: 'Profesor 1' } }],
    hours: () => withSat('14:00', '20:00', '10:00', '14:00'),
    services: [{ name: { en: 'Lesson', ro: 'Lecție' }, duration: 60, price: 100 }],
  },
  other: {
    calendars: [{ name: { en: 'Calendar 1', ro: 'Calendar 1' } }],
    hours: () => weekdays('09:00', '17:00'),
    services: [{ name: { en: 'Appointment', ro: 'Programare' }, duration: 30, price: null }],
  },
};

export const BUSINESS_TYPES = Object.keys(PRESETS);

export const DEFAULT_SETTINGS = {
  // who can book: 'staff_only' = only the owner adds bookings; 'public' = clients book online
  bookingMode: 'public',
  requireApproval: false, // online bookings arrive as "pending" until the owner confirms
  requireAccount: false, // clients must log in to book
  requirePhone: true,
  requireEmail: false,
  allowClientCancel: true,
  cancelHours: 24, // clients may cancel up to N hours before
  defaultDuration: 30,
  slotInterval: 30, // slot grid in minutes
  minNoticeHours: 1,
  maxDaysAhead: 60,
  bufferMinutes: 0, // pause after each appointment
  timezone: 'Europe/Bucharest',
  currency: 'RON',
  showPrices: true,
  calendarLabel: '', // '' = use the type default ("Doctors", "Trainers"...)
  clientLabel: '', // '' = type default ("Patients", "Members"...)
  dayStart: '07:00',
  dayEnd: '21:00',
  weekStart: 1, // 1 = Monday, 0 = Sunday
  hideCancelled: true,
  welcomeMessage: '',
  customFields: [], // [{ id, label, type: 'text'|'textarea'|'number'|'select'|'checkbox'|'date', required, options: [] }]
  // SMS / WhatsApp: channel for reminders, automatic reminders (needs a provider), message texts ('' = default)
  messaging: { channel: 'whatsapp', autoReminder: false, reminderHours: 24, countryCode: '40', templates: { reminder: '', confirmation: '' } },
};
