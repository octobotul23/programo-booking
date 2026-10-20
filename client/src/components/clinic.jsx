import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { addDays, addMonths, nowIn, startOfMonth, startOfWeek } from '../lib/dates.js';
import { useI18n } from '../lib/i18n.jsx';
import { initials } from '../lib/format.js';
import { cx } from './ui.jsx';
import { Info, Table } from './icons.jsx';

/** Loads `path` (skips when null) and reloads when it or `deps` change. */
export function useApi(path, deps = []) {
  const { tErr } = useI18n();
  const [state, setState] = useState({ data: null, error: '', loading: !!path });
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!path) return Promise.resolve();
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    return api(path)
      .then((data) => n === seq.current && setState({ data, error: '', loading: false }))
      .catch((e) => n === seq.current && setState((s) => ({ ...s, error: tErr(e), loading: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tErr, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function PageHead({ title, sub, children, className }) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-[clamp(22px,2.6vw,30px)] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-paper/55">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export const Page = ({ children, className }) => <div className={cx('mx-auto max-w-[1400px] px-4 py-5 md:px-7 md:py-6', className)}>{children}</div>;

/** Date range with quick picks: today, this week, this month, last month, this year. */
export function DateRange({ biz, value, onChange, className }) {
  const { t } = useI18n();
  const today = nowIn(biz.settings.timezone).slice(0, 10);
  const ws = startOfWeek(today, biz.settings.weekStart);
  const lastMonth = addMonths(today, -1);
  const presets = [
    ['today', today, today],
    ['week', ws, addDays(ws, 6)],
    ['month', startOfMonth(today), addDays(addMonths(today, 1), -1)],
    ['lastMonth', lastMonth, addDays(startOfMonth(today), -1)],
    ['year', `${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`],
  ];
  const active = presets.find(([, f, to]) => f === value.from && to === value.to)?.[0];
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      <div className="flex flex-wrap gap-1 rounded-full border border-white/10 bg-ink-2 p-1">
        {presets.map(([k, f, to]) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange({ from: f, to })}
            className={cx('rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors', active === k ? 'bg-gold text-white' : 'text-paper/65 hover:bg-white/8')}
          >
            {t(`range.${k}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input type="date" className="input h-9 w-[150px] py-0 text-[13px]" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} aria-label={t('range.from')} />
        <span className="text-paper/40">–</span>
        <input type="date" className="input h-9 w-[150px] py-0 text-[13px]" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} aria-label={t('range.to')} />
      </div>
    </div>
  );
}

export function thisMonth(biz) {
  const today = nowIn(biz.settings.timezone).slice(0, 10);
  return { from: startOfMonth(today), to: addDays(addMonths(today, 1), -1) };
}

/** Dashboard card: big number, icon, and the two small buttons (explain / show the rows). */
export function StatCard({ icon: Icon, label, value, sub, tone, onInfo, onTable, infoLabel, tableLabel }) {
  return (
    <div className="stat-card relative flex min-h-[112px] flex-col justify-between p-3 sm:min-h-[120px] sm:p-4" style={tone ? { '--stat-bg': tone } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] leading-5 font-medium opacity-90">{label}</div>
        {Icon && <Icon width={26} height={26} className="size-5 shrink-0 opacity-60 sm:size-[26px]" />}
      </div>
      <div className="stat-value mt-2 text-[22px] leading-none min-[400px]:text-[25px] sm:text-[30px] font-semibold tracking-[-0.02em] tabular-nums">{value}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0 text-[12px] leading-4 opacity-80">{sub}</div>
        <div className="flex shrink-0 gap-1">
          {onInfo && (
            <button type="button" onClick={onInfo} className="grid size-7 place-items-center rounded-full opacity-75 hover:bg-white/20 hover:opacity-100" title={infoLabel} aria-label={infoLabel}>
              <Info width={16} height={16} />
            </button>
          )}
          {onTable && (
            <button type="button" onClick={onTable} className="grid size-7 place-items-center rounded-full opacity-75 hover:bg-white/20 hover:opacity-100" title={tableLabel} aria-label={tableLabel}>
              <Table width={16} height={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Avatar({ name, color, size = 36 }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-gold/15 font-semibold text-gold-light"
      style={{ width: size, height: size, fontSize: size * 0.36, ...(color ? { background: `${color}26`, color } : {}) }}
    >
      {initials(name)}
    </span>
  );
}

/** Plain card section with a title row. */
export function Panel({ title, action, children, className, bodyClass }) {
  return (
    <section className={cx('card overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className={cx('p-4', bodyClass)}>{children}</div>
    </section>
  );
}

/** Responsive table: scrolls sideways on phones instead of squashing columns. */
export function DataTable({ head, children, empty, className, min = 640 }) {
  return (
    <div className={cx('thin-scroll overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13px]" style={{ minWidth: min }}>
        <thead>
          <tr className="border-b border-white/10 text-left text-[11px] font-semibold tracking-wide text-paper/50 uppercase">
            {head.map((h, i) => (
              <th key={i} className={cx('px-3 py-2.5 font-semibold whitespace-nowrap', typeof h === 'object' && h?.right && 'text-right')}>
                {typeof h === 'object' ? h?.label : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const Td = ({ children, right, className, ...p }) => (
  <td {...p} className={cx('border-b border-white/[0.06] px-3 py-2.5 align-middle', right && 'text-right tabular-nums', className)}>
    {children}
  </td>
);

export function Dot({ color }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}
