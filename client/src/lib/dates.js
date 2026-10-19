// Same convention as the server: naive local strings, arithmetic in UTC so DST never shifts anything.

const pad = (n) => String(n).padStart(2, '0');
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const parse = (s) => {
  const [d, t = '00:00'] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, day, h, mi));
};
const fmtDate = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const addDays = (date, n) => fmtDate(new Date(parse(date).getTime() + n * 864e5));
export const addMinutes = (dt, n) => {
  const d = new Date(parse(dt).getTime() + n * 6e4);
  return `${fmtDate(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
export const diffMinutes = (a, b) => Math.round((parse(b) - parse(a)) / 6e4);
export const weekday = (date) => parse(date).getUTCDay();
export const weekdayKey = (date) => WEEKDAYS[weekday(date)];

export function startOfWeek(date, weekStart = 1) {
  const diff = (weekday(date) - weekStart + 7) % 7;
  return addDays(date, -diff);
}
export const startOfMonth = (date) => `${date.slice(0, 7)}-01`;
export const addMonths = (date, n) => {
  const d = parse(date);
  return fmtDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
};

/** 6×7 grid of dates covering the month of `date`. */
export function monthGrid(date, weekStart = 1) {
  const first = startOfWeek(startOfMonth(date), weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Now as 'YYYY-MM-DDTHH:MM' in the given timezone. */
export function nowIn(timeZone) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

/* formatting — the date is treated as UTC so the label never drifts */
const F = (locale, opts) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts });
export const fmt = {
  long: (date, locale) => F(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parse(date)),
  medium: (date, locale) => F(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(parse(date)),
  short: (date, locale) => F(locale, { day: 'numeric', month: 'short' }).format(parse(date)),
  month: (date, locale) => F(locale, { month: 'long', year: 'numeric' }).format(parse(date)),
  dayNum: (date) => String(parse(date).getUTCDate()),
  weekdayShort: (date, locale) => F(locale, { weekday: 'short' }).format(parse(date)),
  full: (dt, locale) => `${F(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(parse(dt))}, ${dt.slice(11, 16)}`,
  time: (dt) => dt.slice(11, 16),
};

export const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Europe/Bucharest', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'UTC'];
  }
})();
