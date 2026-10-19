// All appointment times are naive local strings in the business's timezone ('YYYY-MM-DDTHH:MM').
// We do the arithmetic on UTC Date objects so DST shifts never move a slot.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DT_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

const pad = (n) => String(n).padStart(2, '0');

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

const parse = (dt) => {
  const [d, t = '00:00'] = dt.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, da, h, mi));
};
const fmt = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;

export const addMinutes = (dt, minutes) => fmt(new Date(parse(dt).getTime() + minutes * 60000));
export const addDays = (date, days) => addMinutes(`${date}T00:00`, days * 1440).slice(0, 10);
export const diffMinutes = (a, b) => Math.round((parse(b) - parse(a)) / 60000);

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const weekdayKey = (date) => WEEKDAYS[parse(date).getUTCDay()];

/** Current local time in a timezone, as 'YYYY-MM-DDTHH:MM'. */
export function nowIn(timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
  } catch {
    return nowIn('UTC');
  }
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}
