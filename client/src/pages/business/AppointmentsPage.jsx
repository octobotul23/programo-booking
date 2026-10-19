import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button, Empty, Eyebrow, StatusBadge, StatusDot } from '../../components/ui.jsx';
import { Check, Close, List, Search } from '../../components/icons.jsx';
import { api, qs } from '../../lib/api.js';
import { addDays, fmt, nowIn } from '../../lib/dates.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';
import AppointmentModal from './AppointmentModal.jsx';

const STATUSES = ['confirmed', 'pending', 'completed', 'no_show', 'cancelled'];

export default function AppointmentsPage() {
  const { biz } = useOutletContext();
  const { t, tErr, locale } = useI18n();
  const toast = useToast();
  const today = nowIn(biz.settings.timezone).slice(0, 10);
  const [filters, setFilters] = useState({ from: today, to: addDays(today, 30), calendarId: '', status: '', q: '' });
  const [rows, setRows] = useState(null);
  const [pending, setPending] = useState([]);
  const [open, setOpen] = useState(null);

  const cal = new Map(biz.calendars.map((c) => [c.id, c]));
  const svc = new Map(biz.services.map((s) => [s.id, s]));

  const load = useCallback(() => {
    api(`/businesses/${biz.id}/appointments${qs(filters)}`).then(setRows);
    api(`/businesses/${biz.id}/appointments${qs({ status: 'pending', from: today })}`).then(setPending);
  }, [biz.id, filters, today]);

  useEffect(() => {
    const id = setTimeout(load, filters.q ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, filters.q]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  const setStatus = async (a, status) => {
    try {
      await api(`/businesses/${biz.id}/appointments/${a.id}`, { method: 'PATCH', body: { status, force: true } });
      toast(t(`status.${status}`));
      load();
    } catch (err) {
      toast(tErr(err));
    }
  };

  return (
    <div className="px-4 py-5 md:px-8 md:py-7">
      <Eyebrow>{biz.name}</Eyebrow>
      <h1 className="mt-2 text-[clamp(24px,3vw,34px)] leading-tight font-semibold tracking-[-0.025em]">{t('list.title')}</h1>

      {pending.length > 0 && (
        <section className="mt-6 rounded-[20px] border border-gold/30 bg-gold/[0.06] p-4 md:p-5">
          <div className="flex items-center gap-2 text-ui font-semibold text-gold-light">
            <StatusDot status="pending" pulse /> {t('list.waiting')} · {pending.length}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {pending.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-[14px] bg-ink-2/80 px-4 py-3">
                <button type="button" onClick={() => setOpen(a)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[14px] font-semibold">{a.clientName}</div>
                  <div className="truncate text-[12px] text-paper/55">
                    {fmt.full(a.start, locale)} · {cal.get(a.calendarId)?.name}
                    {a.serviceId && ` · ${svc.get(a.serviceId)?.name ?? ''}`}
                  </div>
                </button>
                <div className="flex gap-2">
                  <Button size="sm" variant="gold" onClick={() => setStatus(a, 'confirmed')}>
                    <Check width={14} height={14} /> {t('list.approve')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(a, 'cancelled')}>
                    <Close width={14} height={14} /> {t('list.decline')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* filters */}
      <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-[1fr_150px_150px_180px_160px]">
        <label className="relative col-span-2 md:col-span-1">
          <Search width={16} height={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-paper/40" />
          <input className="input pl-9" placeholder={t('list.search')} value={filters.q} onChange={set('q')} />
        </label>
        <input className="input" type="date" aria-label={t('list.from')} value={filters.from} onChange={set('from')} />
        <input className="input" type="date" aria-label={t('list.to')} value={filters.to} onChange={set('to')} />
        <select className="input" value={filters.calendarId} onChange={set('calendarId')}>
          <option value="">{t('list.anyCalendar')}</option>
          {biz.calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input" value={filters.status} onChange={set('status')}>
          <option value="">{t('list.anyStatus')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {rows === null ? null : rows.length === 0 ? (
          <Empty icon={List}>{t('list.empty')}</Empty>
        ) : (
          <div className="card overflow-hidden">
            <div className="hidden grid-cols-[170px_1.2fr_1fr_1fr_130px] gap-4 border-b border-white/8 px-5 py-3 text-[11px] font-medium tracking-wide text-paper/45 uppercase md:grid">
              <span>{t('list.when')}</span>
              <span>{t('list.who')}</span>
              <span>{t('list.what')}</span>
              <span>{t('list.where')}</span>
              <span />
            </div>
            {rows.map((a) => {
              const c = cal.get(a.calendarId);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setOpen(a)}
                  className="grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-white/6 px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-white/[0.03] md:grid-cols-[170px_1.2fr_1fr_1fr_130px] md:items-center"
                >
                  <span className="text-ui tabular-nums text-paper/75">{fmt.full(a.start, locale)}</span>
                  <span className="order-first min-w-0 md:order-none">
                    <span className="block truncate text-[14px] font-semibold">{a.clientName}</span>
                    <span className="block truncate text-[12px] text-paper/45">{a.clientPhone || a.clientEmail}</span>
                  </span>
                  <span className="hidden truncate text-ui text-paper/70 md:block">{svc.get(a.serviceId)?.name ?? '—'}</span>
                  <span className="hidden items-center gap-2 truncate text-ui text-paper/70 md:flex">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: c?.color }} />
                    {c?.name}
                  </span>
                  <span className="row-span-2 self-center justify-self-end md:row-span-1">
                    <StatusBadge status={a.status} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <AppointmentModal
          biz={biz}
          appointment={open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
}
