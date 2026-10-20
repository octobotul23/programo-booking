import { saveTextFile } from './device.js';

// Money, names and file export helpers shared by the clinic screens.

/** 1234.5 → "1.234,50 RON" (ro) / "1,234.50 RON" (en). Whole amounts drop the decimals. */
export function money(value, currency = 'RON', locale = 'ro-RO') {
  const n = Number(value) || 0;
  const whole = Math.abs(n % 1) < 0.005;
  const s = new Intl.NumberFormat(locale, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(n);
  return currency ? `${s} ${currency}` : s;
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

/** Years between a 'YYYY-MM-DD' birth date and a 'YYYY-MM-DD' day. */
export function age(birthDate, today) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/**
 * Downloads rows as a CSV that Excel opens correctly: UTF-8 BOM for diacritics, and ";" as the
 * separator in Romanian (Excel there uses "," for decimals). Rejects when the file could not be saved
 * (in the phone app: too large, or no space), so the caller can say so.
 */
export function downloadCsv(filename, header, rows, lang = 'en') {
  const sep = lang === 'ro' ? ';' : ',';
  const cell = (v) => {
    if (typeof v === 'number') {
      // to the cent: sums of prices come back as 1234.5000000001
      const n = String(Math.round(v * 100) / 100);
      return lang === 'ro' ? n.replace('.', ',') : n;
    }
    let s = v === null || v === undefined ? '' : String(v);
    // text starting with = + - @ would run as a formula in Excel (CSV injection)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(sep)).join('\r\n');
  return saveTextFile(filename, 'text/csv', '\uFEFF' + text);
}
