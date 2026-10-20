import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Button, Chip, ChipGroup, IconButton, Modal, Segmented, Stat, StatusDot, Toggle, cx } from '../../components/ui.jsx';
import { ChevronLeft, ChevronRight, Plus, Users } from '../../components/icons.jsx';
import { api, qs } from '../../lib/api.js';
import { addDays, addMonths, fmt, fromMin, monthGrid, nowIn, startOfWeek, toMin, weekdayKey } from '../../lib/dates.js';
import { useI18n } from '../../lib/i18n.jsx';
import AppointmentModal from './AppointmentModal.jsx';

const PX = 2; // pixels per minute in the time grid (30px per quarter hour)
const ACTIVE = ['pending', 'confirmed'];

const store = {
  get: (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export default function CalendarPage() {
  const { biz, labels, version } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const { t, locale } = useI18n();
  const s = biz.settings;
  const today = nowIn(s.timezone).slice(0, 10);
  const calendars = biz.calendars.filter((c) => c.active);

  const [view, setView] = useState(() => store.get('cal.view', 'day'));
  const [tab, setTab] = useState(() => store.get(`cal.tab.${biz.id}`, 'all'));
  // ?date=YYYY-MM-DD opens that day; ?open=<id> opens that booking (links from the dashboard, search, notifications)
  const [date, setDate] = useState(() => (isDate(params.get('date')) ? params.get('date') : today));
  const [appts, setAppts] = useState([]);
  const [timeOff, setTimeOff] = useState([]);
  const [showCancelled, setShowCancelled] = useState(!s.hideCancelled);
  const [modal, setModal] = useState(null);
  const [group, setGroup] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => store.set('cal.view', view), [view]);
  useEffect(() => store.set(`cal.tab.${biz.id}`, tab), [biz.id, tab]);
  // a removed calendar must not stay selected
  useEffect(() => {
    if (tab !== 'all' && !calendars.some((c) => c.id === tab)) setTab('all');
  }, [calendars, tab]);

  const range = useMemo(() => {
    if (view === 'day') return [date, date];
    if (view === 'week') {
      const from = startOfWeek(date, s.weekStart);
      return [from, addDays(from, 6)];
    }
    const grid = monthGrid(date, s.weekStart);
    return [grid[0], grid[41]];
  }, [view, date, s.weekStart]);

  const load = useCallback(async () => {
    const [from, to] = range;
    const [a, off] = await Promise.all([
      api(`/businesses/${biz.id}/appointments${qs({ from, to })}`),
      api(`/businesses/${biz.id}/timeoff${qs({ from: `${from}T00:00`, to: `${addDays(to, 1)}T00:00` })}`),
    ]);
    setAppts(a);
    setTimeOff(off);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz.id, range, version]);

  const loadStats = useCallback(async () => {
    const ws = startOfWeek(today, s.weekStart);
    const [week, pending] = await Promise.all([
      api(`/businesses/${biz.id}/appointments${qs({ from: ws, to: addDays(ws, 6) })}`),
      api(`/businesses/${biz.id}/appointments${qs({ from: today, status: 'pending' })}`),
    ]);
    const live = week.filter((a) => ACTIVE.includes(a.status) || a.status === 'completed');
    setStats({ today: live.filter((a) => a.start.startsWith(today)).length, week: live.length, pending: pending.length });
  }, [biz.id, today, s.weekStart]);

  useEffect(() => {
    const d = params.get('date');
    if (isDate(d) && d !== date) setDate(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  useEffect(() => {
    const id = Number(params.get('open'));
    const a = id && appts.find((x) => x.id === id);
    if (!a) return;
    setModal({ appointment: a });
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
  }, [appts, params, setParams]);
  useEffect(() => {
    loadStats().catch(() => {});
  }, [loadStats]);

  const visible = useMemo(
    () =>
      appts.filter(
        (a) => (showCancelled || a.status !== 'cancelled') && (tab === 'all' ? calendars.some((c) => c.id === a.calendarId) : a.calendarId === tab),
      ),
    [appts, showCancelled, tab, calendars],
  );

  const step = (dir) => {
    if (view === 'day') setDate(addDays(date, dir));
    else if (view === 'week') setDate(addDays(date, dir * 7));
    else setDate(addMonths(date, dir));
  };

  const title =
    view === 'day'
      ? fmt.long(date, locale)
      : view === 'week'
        ? `${fmt.short(range[0], locale)} — ${fmt.short(range[1], locale)} ${range[1].slice(0, 4)}`
        : fmt.month(date, locale);

  const openNew = (preset) => setModal({ preset: { calendarId: tab === 'all' ? calendars[0]?.id : tab, date, ...preset } });
  const onSaved = () => {
    setModal(null);
    setGroup(null);
    load();
    loadStats();
  };

  // columns for the time grid
  const columns = useMemo(() => {
    if (view === 'day') {
      const cals = tab === 'all' ? calendars : calendars.filter((c) => c.id === tab);
      return cals.map((c) => ({ key: `${c.id}`, date, calendars: [c], label: c.name, color: c.color, sub: c.capacity > 1 ? `${c.capacity}×` : '' }));
    }
    if (view === 'week') {
      const cals = tab === 'all' ? calendars : calendars.filter((c) => c.id === tab);
      return Array.from({ length: 7 }, (_, i) => {
        const d = addDays(range[0], i);
        return { key: d, date: d, calendars: cals, label: fmt.weekdayShort(d, locale), sub: fmt.dayNum(d), isToday: d === today };
      });
    }
    return [];
  }, [view, tab, calendars, date, range, locale, today]);

  return (
    <div className="px-4 py-5 md:px-8 md:py-7">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow text-gold">{labels.calendars}</div>
          <h1 className="mt-2 text-[clamp(24px,3vw,34px)] leading-tight font-semibold tracking-[-0.025em] first-letter:uppercase">{title}</h1>
        </div>
        {stats && (
          <div className="hidden gap-8 md:flex">
            <Stat value={stats.today} label={t('cal.todayCount')} />
            <Stat value={stats.week} label={t('cal.weekCount')} />
            <Stat value={stats.pending} label={t('cal.pendingCount')} />
          </div>
        )}
      </div>

      {/* toolbar */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setDate(today)}>
          {t('cal.today')}
        </Button>
        <IconButton size="sm" label="←" onClick={() => step(-1)}>
          <ChevronLeft width={16} height={16} />
        </IconButton>
        <IconButton size="sm" label="→" onClick={() => step(1)}>
          <ChevronRight width={16} height={16} />
        </IconButton>
        <input type="date" className="input h-8 w-auto rounded-full px-3 text-[12px]" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <Segmented
          className="ml-auto"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: t('cal.day') },
            { value: 'week', label: t('cal.week') },
            { value: 'month', label: t('cal.month') },
          ]}
        />
        <Button size="sm" variant="gold" onClick={() => openNew({ time: '' })}>
          <Plus width={14} height={14} /> <span className="hidden sm:inline">{t('cal.newAppointment')}</span>
        </Button>
      </div>

      {/* calendar tabs — "sheets" */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <ChipGroup>
          <Chip active={tab === 'all'} onClick={() => setTab('all')}>
            {t('cal.all')}
          </Chip>
          {calendars.map((c) => (
            <Chip key={c.id} active={tab === c.id} color={c.color} onClick={() => setTab(c.id)}>
              {c.name}
            </Chip>
          ))}
        </ChipGroup>
        <div className="ml-auto">
          <Toggle checked={showCancelled} onChange={setShowCancelled} label={<span className="text-ui text-paper/70">{t('cal.showCancelled')}</span>} />
        </div>
      </div>

      <div className="mt-4">
        {view === 'month' ? (
          <MonthView
            biz={biz}
            date={date}
            today={today}
            appts={visible}
            calendars={calendars}
            onPickDay={(d) => {
              setDate(d);
              setView('day');
            }}
          />
        ) : (
          <TimeGrid
            biz={biz}
            columns={columns}
            appts={visible}
            timeOff={timeOff}
            today={today}
            now={nowIn(s.timezone)}
            onEmpty={(col, time) => setModal({ preset: { calendarId: col.calendars.length === 1 ? col.calendars[0].id : calendars[0]?.id, date: col.date, time } })}
            onOpen={(a) => setModal({ appointment: a })}
            onGroup={setGroup}
            onPickDay={(d) => {
              setDate(d);
              setView('day');
            }}
          />
        )}
      </div>

      {modal && (
        <AppointmentModal
          biz={biz}
          appointment={modal.appointment}
          preset={modal.preset && { ...modal.preset, time: modal.preset.time || fromMin(Math.max(toMin(s.dayStart), 9 * 60)) }}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}

      {group && (
        <Modal
          open
          onClose={() => setGroup(null)}
          eyebrow={group.calendar.name}
          title={`${fmt.medium(group.start.slice(0, 10), locale)} · ${group.start.slice(11)}`}
          footer={
            group.items.filter((a) => ACTIVE.includes(a.status)).length < group.calendar.capacity && (
              <Button
                variant="gold"
                onClick={() => {
                  const first = group.items[0];
                  setGroup(null);
                  setModal({ preset: { calendarId: group.calendar.id, date: group.start.slice(0, 10), time: group.start.slice(11), serviceId: first.serviceId } });
                }}
              >
                <Plus width={14} height={14} /> {t('common.add')}
              </Button>
            )
          }
        >
          <div className="mb-3 flex items-center gap-2 text-ui text-paper/60">
            <Users width={16} height={16} />
            {t('cal.spots', { n: group.items.filter((a) => ACTIVE.includes(a.status)).length, c: group.calendar.capacity })}
          </div>
          <div className="flex flex-col gap-1.5">
            {group.items.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setGroup(null);
                  setModal({ appointment: a });
                }}
                className="flex items-center gap-3 rounded-[12px] border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-left hover:border-white/25"
              >
                <StatusDot status={a.status} />
                <span className={cx('flex-1 truncate text-[14px]', a.status === 'cancelled' && 'line-through opacity-50')}>{a.clientName}</span>
                <span className="text-[12px] text-paper/45">{a.clientPhone}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ───────── time grid (day: one column per calendar · week: one per day) ───────── */

/** Side-by-side lanes for overlapping blocks. */
function layoutLanes(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const out = [];
  let cluster = [];
  let clusterEnd = '';
  const flush = () => {
    const lanes = [];
    for (const b of cluster) {
      let lane = lanes.findIndex((end) => end <= b.start);
      if (lane === -1) lane = lanes.push('') - 1;
      lanes[lane] = b.end;
      b.lane = lane;
    }
    cluster.forEach((b) => out.push({ ...b, lanes: lanes.length }));
    cluster = [];
  };
  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = b.end > clusterEnd || cluster.length === 1 ? b.end : clusterEnd;
  }
  if (cluster.length) flush();
  return out;
}

/** Group bookings of multi-place calendars (classes) that share the same time into one block. */
function toBlocks(appts, calendarsById) {
  const blocks = [];
  const groups = new Map();
  for (const a of appts) {
    const cal = calendarsById.get(a.calendarId);
    if (cal?.capacity > 1) {
      const k = `${a.calendarId}|${a.start}|${a.end}`;
      if (!groups.has(k)) {
        const g = { kind: 'group', key: k, start: a.start, end: a.end, calendar: cal, items: [] };
        groups.set(k, g);
        blocks.push(g);
      }
      groups.get(k).items.push(a);
    } else blocks.push({ kind: 'single', key: `a${a.id}`, start: a.start, end: a.end, calendar: cal, appt: a });
  }
  return blocks;
}

function TimeGrid({ biz, columns, appts, timeOff, today, now, onEmpty, onOpen, onGroup, onPickDay }) {
  const { t } = useI18n();
  const s = biz.settings;
  const startMin = toMin(s.dayStart);
  const endMin = toMin(s.dayEnd);
  const height = (endMin - startMin) * PX;
  const scroller = useRef(null);
  const calendarsById = useMemo(() => new Map(biz.calendars.map((c) => [c.id, c])), [biz.calendars]);
  const serviceById = useMemo(() => new Map(biz.services.map((x) => [x.id, x])), [biz.services]);

  // scroll so that ~1h before now (or opening time) is visible
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = columns.some((c) => c.date === today) ? toMin(now.slice(11)) - 60 : startMin + 60;
    el.scrollTop = Math.max(0, (target - startMin) * PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.length, columns[0]?.date]);

  // a mark every 15 minutes; full hours get the strong line and the big label
  const quarters = [];
  for (let m = Math.ceil(startMin / 15) * 15; m < endMin; m += 15) quarters.push(m);
  const y = (min) => (min - startMin) * PX;
  const minOf = (dt, date) => (dt.slice(0, 10) < date ? 0 : dt.slice(0, 10) > date ? 1440 : toMin(dt.slice(11, 16)));

  if (!columns.length) return <div className="card p-10 text-center text-paper/50">{t('cal.noCalendars')}</div>;

  return (
    <div className="card overflow-hidden">
      <div ref={scroller} className="thin-scroll max-h-[calc(100dvh-280px)] min-h-[420px] overflow-auto">
        <div className="relative flex" style={{ minWidth: columns.length * 150 + 56 }}>
          {/* hour gutter */}
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-white/8 bg-ink-2">
            <div className="sticky top-0 z-10 h-12 border-b border-white/8 bg-ink-2" />
            <div className="relative" style={{ height }}>
              {quarters.map((m) =>
                m === startMin ? null : (
                  <div
                    key={m}
                    className={cx(
                      'absolute right-2 -translate-y-1/2 tabular-nums',
                      m % 60 ? 'text-[10px] text-paper/30' : 'text-[12px] font-semibold text-paper/70',
                    )}
                    style={{ top: y(m) }}
                  >
                    {m % 60 ? `:${String(m % 60).padStart(2, '0')}` : fromMin(m)}
                  </div>
                ),
              )}
            </div>
          </div>

          {columns.map((col) => {
            const dayKey = weekdayKey(col.date);
            // open hours = union of the column's calendars
            const open = col.calendars.flatMap((c) => c.hours[dayKey] ?? []).map(([a, b]) => [toMin(a), toMin(b)]);
            const closed = [];
            let cursor = startMin;
            [...open]
              .sort((a, b) => a[0] - b[0])
              .forEach(([a, b]) => {
                if (a > cursor) closed.push([cursor, Math.min(a, endMin)]);
                cursor = Math.max(cursor, b);
              });
            if (cursor < endMin) closed.push([cursor, endMin]);

            const colCalIds = new Set(col.calendars.map((c) => c.id));
            const offs = timeOff.filter(
              (o) => (o.calendarId === null || colCalIds.has(o.calendarId)) && o.start.slice(0, 10) <= col.date && o.end > `${col.date}T00:00`,
            );
            const items = appts.filter((a) => a.start.startsWith(col.date) && colCalIds.has(a.calendarId));
            const blocks = layoutLanes(toBlocks(items, calendarsById));
            const isToday = col.date === today;

            return (
              <div key={col.key} className="min-w-[150px] flex-1 border-r border-white/6 last:border-r-0">
                <button
                  type="button"
                  onClick={() => onPickDay?.(col.date)}
                  className={cx(
                    'sticky top-0 z-10 flex h-12 w-full items-center justify-center gap-2 border-b border-white/8 bg-ink-2/95 px-2 text-ui font-semibold backdrop-blur',
                    col.isToday && 'text-gold-light',
                  )}
                >
                  {col.color && <span className="size-2 shrink-0 rounded-full" style={{ background: col.color }} />}
                  <span className="truncate">{col.label}</span>
                  {col.sub && <span className={cx('font-light', col.isToday ? 'grid size-7 place-items-center rounded-full bg-gold text-ink font-semibold' : 'text-paper/45')}>{col.sub}</span>}
                </button>

                <div
                  className="relative cursor-copy"
                  style={{ height }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const min = startMin + (e.clientY - rect.top) / PX;
                    const snapped = Math.floor(min / s.slotInterval) * s.slotInterval;
                    onEmpty(col, fromMin(Math.max(startMin, Math.min(snapped, endMin - s.slotInterval))));
                  }}
                >
                  {/* grid lines */}
                  {quarters.map((m) => (
                    <div
                      key={m}
                      className={cx('pointer-events-none absolute inset-x-0 border-t', m % 60 ? 'border-dotted border-white/[0.06]' : 'border-white/[0.12]')}
                      style={{ top: y(m) }}
                    />
                  ))}
                  {/* closed hours */}
                  {closed.map(([a, b]) => (
                    <div key={`c${a}`} className="hatch pointer-events-none absolute inset-x-0 bg-black/25" style={{ top: y(a), height: (b - a) * PX }} />
                  ))}
                  {/* time off */}
                  {offs.map((o) => {
                    const a = Math.max(startMin, minOf(o.start, col.date));
                    const b = Math.min(endMin, minOf(o.end, col.date));
                    if (b <= a) return null;
                    return (
                      <div key={`o${o.id}`} className="hatch pointer-events-none absolute inset-x-0 flex items-start bg-ember/[0.07] p-1.5" style={{ top: y(a), height: (b - a) * PX }}>
                        <span className="text-[10px] font-medium text-danger">{o.reason || t('cal.timeOff')}</span>
                      </div>
                    );
                  })}
                  {/* now line */}
                  {isToday && toMin(now.slice(11)) > startMin && toMin(now.slice(11)) < endMin && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 h-px bg-ember" style={{ top: y(toMin(now.slice(11))) }}>
                      <span className="absolute -top-1 -left-1 size-2 rounded-full bg-ember" />
                    </div>
                  )}
                  {/* appointments */}
                  {blocks.map((b) => {
                    const top = y(Math.max(startMin, toMin(b.start.slice(11))));
                    const h = Math.max(22, (Math.min(endMin, b.end.slice(0, 10) > col.date ? endMin : toMin(b.end.slice(11))) - Math.max(startMin, toMin(b.start.slice(11)))) * PX - 2);
                    const width = 100 / b.lanes;
                    const color = b.calendar?.color ?? '#c9a96e';
                    const style = { top, height: h, left: `calc(${b.lane * width}% + 2px)`, width: `calc(${width}% - 4px)`, '--c': color };
                    if (b.kind === 'group') {
                      const booked = b.items.filter((a) => ACTIVE.includes(a.status)).length;
                      return (
                        <button
                          key={b.key}
                          type="button"
                          onClick={() => onGroup(b)}
                          style={style}
                          className="absolute z-[5] overflow-hidden rounded-[10px] border border-[color-mix(in_srgb,var(--c)_45%,transparent)] bg-[color-mix(in_srgb,var(--c)_18%,var(--color-ink-2))] px-2 py-1 text-left transition-[filter] hover:brightness-125"
                        >
                          <div className="flex items-center gap-1.5 text-[11px] text-paper/70 tabular-nums">
                            <Users width={12} height={12} /> {b.start.slice(11)} · {booked}/{b.calendar.capacity}
                          </div>
                          <div className="truncate text-[12px] font-semibold">{serviceById.get(b.items[0].serviceId)?.name ?? b.calendar.name}</div>
                        </button>
                      );
                    }
                    const a = b.appt;
                    const svc = serviceById.get(a.serviceId);
                    return (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => onOpen(a)}
                        style={{ ...style, '--c': svc?.color || color }}
                        className={cx(
                          'absolute z-[5] overflow-hidden rounded-[10px] border-l-[3px] border-[color:var(--c)] bg-[color-mix(in_srgb,var(--c)_16%,var(--color-ink-2))] px-2 py-1 text-left transition-[filter] hover:brightness-125',
                          a.status === 'pending' && 'border border-dashed border-l-[3px] border-[color:var(--c)]',
                          a.status === 'cancelled' && 'opacity-40',
                          a.status === 'completed' && 'opacity-70',
                          a.status === 'no_show' && 'opacity-60',
                        )}
                      >
                        <div className="flex items-center gap-1.5 overflow-hidden text-[11px] leading-4 whitespace-nowrap text-paper/60 tabular-nums">
                          {a.status !== 'confirmed' && <StatusDot status={a.status} />}
                          <span className="truncate">
                            {a.start.slice(11)}–{a.end.slice(11)}
                          </span>
                        </div>
                        <div className={cx('truncate text-[12px] leading-4 font-semibold', a.status === 'cancelled' && 'line-through')}>{a.clientName}</div>
                        {h >= 60 && svc && <div className="truncate text-[11px] text-paper/55">{svc.name}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ───────── month ───────── */

function MonthView({ biz, date, today, appts, calendars, onPickDay }) {
  const { t, locale } = useI18n();
  const grid = monthGrid(date, biz.settings.weekStart);
  const month = date.slice(0, 7);
  const colorOf = new Map(calendars.map((c) => [c.id, c.color]));
  const byDay = useMemo(() => {
    const m = new Map();
    for (const a of appts) {
      const d = a.start.slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(a);
    }
    return m;
  }, [appts]);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/8">
        {grid.slice(0, 7).map((d) => (
          <div key={d} className="py-2.5 text-center text-[11px] font-medium tracking-wide text-paper/45 uppercase">
            {fmt.weekdayShort(d, locale)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((d) => {
          const list = (byDay.get(d) ?? []).sort((a, b) => a.start.localeCompare(b.start));
          const inMonth = d.startsWith(month);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPickDay(d)}
              className={cx(
                'flex min-h-[92px] flex-col gap-1 border-r border-b border-white/6 p-1.5 text-left transition-colors hover:bg-white/[0.03] md:min-h-[118px] md:p-2 [&:nth-child(7n)]:border-r-0',
                !inMonth && 'opacity-35',
              )}
            >
              <span className={cx('grid size-7 place-items-center rounded-full text-[12px] font-semibold tabular-nums', d === today && 'bg-gold text-ink')}>{fmt.dayNum(d)}</span>
              {list.slice(0, 3).map((a) => (
                <span key={a.id} className={cx('hidden items-center gap-1.5 truncate rounded-[6px] bg-white/[0.04] px-1.5 py-0.5 text-[11px] md:flex', a.status === 'cancelled' && 'line-through opacity-50')}>
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: colorOf.get(a.calendarId) }} />
                  <span className="text-paper/50 tabular-nums">{a.start.slice(11)}</span>
                  <span className="truncate">{a.clientName}</span>
                </span>
              ))}
              {list.length > 3 && <span className="hidden px-1.5 text-[11px] text-paper/45 md:block">{t('cal.more', { n: list.length - 3 })}</span>}
              {list.length > 0 && (
                <span className="mt-auto flex flex-wrap gap-0.5 md:hidden">
                  {list.slice(0, 6).map((a) => (
                    <span key={a.id} className="size-1.5 rounded-full" style={{ background: colorOf.get(a.calendarId) }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
