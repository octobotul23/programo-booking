import { useEffect, useState } from 'react';
import { Navigate, NavLink, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Button, ErrorNote, Eyebrow, Field, IconButton, Segmented, TimeInput, Toggle, cx } from '../../components/ui.jsx';
import { Close, Copy, Plus, Trash, Up, ChevronDown } from '../../components/icons.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { TIMEZONES, fmt, nowIn, addDays } from '../../lib/dates.js';
import { copyText } from '../../lib/device.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';
import AuditLog from './AuditLog.jsx';

const OWNER_TABS = ['general', 'booking', 'calendars', 'services', 'form', 'timeoff', 'team', 'activity', 'appearance', 'account'];
// team members only manage their own days off and their own login
const STAFF_TABS = ['timeoff', 'account'];
const TYPES = ['clinic', 'dental', 'gym', 'salon', 'spa', 'physio', 'vet', 'tutoring', 'other'];
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function SettingsPage() {
  const { tab } = useParams();
  const { t } = useI18n();
  const ctx = useOutletContext();
  const TABS = ctx.biz.me.role === 'owner' ? OWNER_TABS : STAFF_TABS;
  if (!TABS.includes(tab)) return <Navigate to={`../${TABS[0]}`} relative="path" replace />;
  const active = tab;

  return (
    <div className="px-4 py-5 md:px-8 md:py-7">
      <Eyebrow>{ctx.biz.name}</Eyebrow>
      <h1 className="mt-2 text-[clamp(24px,3vw,34px)] leading-tight font-semibold tracking-[-0.025em]">{t('settings.title')}</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-10">
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {TABS.map((k) => (
            <NavLink
              key={k}
              to={`../${k}`}
              relative="path"
              className={({ isActive }) =>
                cx(
                  'shrink-0 rounded-full px-4 py-2 text-ui font-medium whitespace-nowrap transition-colors',
                  isActive || active === k ? 'bg-paper text-ink' : 'text-paper/65 hover:bg-white/8 hover:text-paper',
                )
              }
            >
              {t(`settings.tabs.${k}`)}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 max-w-[860px]">
          {active === 'general' && <General {...ctx} />}
          {active === 'booking' && <Booking {...ctx} />}
          {active === 'calendars' && <Calendars {...ctx} />}
          {active === 'services' && <Services {...ctx} />}
          {active === 'form' && <FormFields {...ctx} />}
          {active === 'timeoff' && <TimeOff {...ctx} />}
          {active === 'team' && <Team {...ctx} />}
          {active === 'activity' && <AuditLog biz={ctx.biz} />}
          {active === 'appearance' && <Appearance {...ctx} />}
          {active === 'account' && <Account />}
        </div>
      </div>
    </div>
  );
}

/* ───────── shared bits ───────── */

function Section({ title, lead, children, footer }) {
  return (
    <section className="card p-5 md:p-6">
      {title && <h2 className="text-[18px] leading-6 font-semibold tracking-[-0.01em]">{title}</h2>}
      {lead && <p className="mt-1 text-ui text-paper/55">{lead}</p>}
      <div className={cx('flex flex-col gap-4', (title || lead) && 'mt-5')}>{children}</div>
      {footer && <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-white/8 pt-4">{footer}</div>}
    </section>
  );
}

/** Draft state for a business PATCH with a single save button. */
function useBizDraft(biz, setBiz, pick) {
  const { t, tErr } = useI18n();
  const toast = useToast();
  const { refresh } = useAuth();
  const [draft, setDraft] = useState(() => pick(biz));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (body = draft) => {
    setBusy(true);
    setError('');
    try {
      const next = await api(`/businesses/${biz.id}`, { method: 'PATCH', body });
      setBiz(next);
      setDraft(pick(next));
      refresh();
      toast(t('settings.saved'));
    } catch (err) {
      setError(tErr(err));
    } finally {
      setBusy(false);
    }
  };
  return { draft, setDraft, save, busy, error };
}

/* ───────── general ───────── */

function General({ biz, setBiz }) {
  const { t, tErr } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { draft, setDraft, save, busy, error } = useBizDraft(biz, setBiz, (b) => ({
    name: b.name,
    type: b.type,
    description: b.description,
    phone: b.phone,
    email: b.email,
    address: b.address,
    slug: b.slug,
  }));
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  const link = `${window.location.origin}/b/${biz.slug}`;

  const destroy = async () => {
    if (!window.confirm(t('settings.deleteBusinessConfirm', { name: biz.name }))) return;
    try {
      await api(`/businesses/${biz.id}`, { method: 'DELETE' });
      await refresh();
      navigate('/app', { replace: true });
    } catch (err) {
      toast(tErr(err));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Section
        footer={
          <Button variant="primary" onClick={() => save()} disabled={busy}>
            {t('settings.save')}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.name')}>
            <input className="input" value={draft.name} onChange={set('name')} />
          </Field>
          <Field label={t('settings.type')}>
            <select className="input" value={draft.type} onChange={set('type')}>
              {TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(`types.${k}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('settings.description')}>
          <textarea className="input" value={draft.description} onChange={set('description')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.phone')}>
            <input className="input" type="tel" value={draft.phone} onChange={set('phone')} />
          </Field>
          <Field label={t('settings.email')}>
            <input className="input" type="email" value={draft.email} onChange={set('email')} />
          </Field>
        </div>
        <Field label={t('settings.address')}>
          <input className="input" value={draft.address} onChange={set('address')} />
        </Field>
        <Field label={t('settings.slug')} hint={link}>
          <div className="flex gap-2">
            <span className="input flex w-auto shrink-0 items-center text-paper/40">/b/</span>
            <input className="input" value={draft.slug} onChange={set('slug')} />
            <IconButton
              label={t('common.copy')}
              onClick={async () => {
                if (await copyText(link)) toast(t('common.copied'));
                else window.prompt(t('common.copyManual'), link);
              }}
            >
              <Copy width={16} height={16} />
            </IconButton>
          </div>
        </Field>
        <ErrorNote>{error}</ErrorNote>
      </Section>
      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={destroy}>
          <Trash width={14} height={14} /> {t('settings.deleteBusiness')}
        </Button>
      </div>
    </div>
  );
}

/* ───────── booking rules ───────── */

function Booking({ biz, setBiz }) {
  const { t } = useI18n();
  const { draft, setDraft, save, busy, error } = useBizDraft(biz, setBiz, (b) => ({ ...b.settings }));
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const num = (k) => (e) => set(k, e.target.value === '' ? '' : Number(e.target.value));
  const mode = draft.bookingMode === 'staff_only' ? 'staff_only' : draft.requireApproval ? 'approval' : 'public';
  const isPublic = draft.bookingMode === 'public';

  return (
    <Section
      footer={
        <Button variant="primary" onClick={() => save({ settings: draft })} disabled={busy}>
          {t('settings.save')}
        </Button>
      }
    >
      <Field label={t('settings.bookingMode')}>
        <Segmented
          className="w-fit"
          value={mode}
          onChange={(m) => setDraft({ ...draft, bookingMode: m === 'staff_only' ? 'staff_only' : 'public', requireApproval: m === 'approval' })}
          options={[
            { value: 'staff_only', label: t('onboarding.modeStaff') },
            { value: 'public', label: t('settings.modeOnline') },
            { value: 'approval', label: t('settings.modeApproval') },
          ]}
        />
      </Field>
      <p className="-mt-2 text-[12px] text-paper/50">
        {mode === 'staff_only' ? t('onboarding.modeStaffDesc') : mode === 'approval' ? t('onboarding.modeApprovalDesc') : t('onboarding.modePublicDesc')}
      </p>

      <div className="grid gap-1 sm:grid-cols-2">
        <Toggle disabled={!isPublic} checked={draft.requireAccount} onChange={(v) => set('requireAccount', v)} label={t('settings.requireAccount')} />
        <Toggle disabled={!isPublic} checked={draft.showPrices} onChange={(v) => set('showPrices', v)} label={t('settings.showPrices')} />
        <Toggle disabled={!isPublic} checked={draft.requirePhone} onChange={(v) => set('requirePhone', v)} label={t('settings.requirePhone')} />
        <Toggle disabled={!isPublic} checked={draft.requireEmail} onChange={(v) => set('requireEmail', v)} label={t('settings.requireEmail')} />
        <Toggle disabled={!isPublic} checked={draft.allowClientCancel} onChange={(v) => set('allowClientCancel', v)} label={t('settings.allowClientCancel')} />
      </div>

      <div className="grid gap-4 border-t border-white/8 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('settings.defaultDuration')}>
          <input className="input" type="number" min={5} step={5} value={draft.defaultDuration} onChange={num('defaultDuration')} />
        </Field>
        <Field label={t('settings.slotInterval')}>
          <select className="input" value={draft.slotInterval} onChange={num('slotInterval')}>
            {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('settings.bufferMinutes')}>
          <input className="input" type="number" min={0} step={5} value={draft.bufferMinutes} onChange={num('bufferMinutes')} />
        </Field>
        <Field label={t('settings.minNoticeHours')}>
          <input className="input" type="number" min={0} value={draft.minNoticeHours} onChange={num('minNoticeHours')} />
        </Field>
        <Field label={t('settings.maxDaysAhead')}>
          <input className="input" type="number" min={1} value={draft.maxDaysAhead} onChange={num('maxDaysAhead')} />
        </Field>
        <Field label={t('settings.cancelHours')}>
          <input className="input" type="number" min={0} disabled={!draft.allowClientCancel} value={draft.cancelHours} onChange={num('cancelHours')} />
        </Field>
        <Field label={t('settings.timezone')}>
          <select className="input" value={draft.timezone} onChange={(e) => set('timezone', e.target.value)}>
            {TIMEZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('settings.currency')}>
          <input className="input" maxLength={8} value={draft.currency} onChange={(e) => set('currency', e.target.value)} />
        </Field>
      </div>
      <Field label={t('settings.welcomeMessage')}>
        <textarea className="input" value={draft.welcomeMessage} onChange={(e) => set('welcomeMessage', e.target.value)} />
      </Field>
      <ErrorNote>{error}</ErrorNote>
    </Section>
  );
}

/* ───────── calendars ───────── */

function Calendars({ biz, setBiz, labels }) {
  const { t, tErr } = useI18n();
  const toast = useToast();
  const [openId, setOpenId] = useState(biz.calendars[0]?.id ?? null);

  const replace = (cals) => setBiz({ ...biz, calendars: cals });
  const add = async () => {
    try {
      const c = await api(`/businesses/${biz.id}/calendars`, { method: 'POST', body: { name: `${labels.calendars} ${biz.calendars.length + 1}` } });
      replace([...biz.calendars, c]);
      setOpenId(c.id);
    } catch (err) {
      toast(tErr(err));
    }
  };
  const move = async (i, dir) => {
    const list = [...biz.calendars];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    replace(list);
    await api(`/businesses/${biz.id}/calendars/reorder`, { method: 'POST', body: { ids: list.map((c) => c.id) } }).catch(() => {});
  };

  return (
    <div className="flex flex-col gap-3">
      {biz.calendars.map((c, i) => (
        <div key={c.id} className="card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="size-3 shrink-0 rounded-full" style={{ background: c.color }} />
            <button type="button" onClick={() => setOpenId(openId === c.id ? null : c.id)} className="min-w-0 flex-1 text-left">
              <div className={cx('truncate text-[15px] font-semibold', !c.active && 'text-paper/40 line-through')}>{c.name}</div>
              <div className="text-[12px] text-paper/45">
                {DAY_ORDER.filter((d) => c.hours[d]?.length)
                  .map((d) => t(`days.${d}`))
                  .join(' · ') || t('settings.dayOff')}
                {c.capacity > 1 && ` · ${c.capacity}×`}
              </div>
            </button>
            <IconButton size="sm" label="↑" disabled={i === 0} onClick={() => move(i, -1)}>
              <Up width={14} height={14} />
            </IconButton>
            <IconButton size="sm" label="↓" disabled={i === biz.calendars.length - 1} onClick={() => move(i, 1)}>
              <ChevronDown width={14} height={14} />
            </IconButton>
          </div>
          {openId === c.id && (
            <CalendarEditor
              key={c.id}
              biz={biz}
              calendar={c}
              onSaved={(nc) => replace(biz.calendars.map((x) => (x.id === nc.id ? nc : x)))}
              onDeleted={() => replace(biz.calendars.filter((x) => x.id !== c.id))}
            />
          )}
        </div>
      ))}
      <div>
        <Button variant="outline" onClick={add}>
          <Plus width={15} height={15} /> {t('settings.addCalendar')}
        </Button>
      </div>
    </div>
  );
}

function CalendarEditor({ biz, calendar, onSaved, onDeleted }) {
  const { t, tErr } = useI18n();
  const toast = useToast();
  const [d, setD] = useState({ ...calendar, defaultDuration: calendar.defaultDuration ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { ...d, defaultDuration: d.defaultDuration === '' ? null : Number(d.defaultDuration), capacity: Number(d.capacity) };
      onSaved(await api(`/businesses/${biz.id}/calendars/${calendar.id}`, { method: 'PATCH', body }));
      toast(t('settings.saved'));
    } catch (err) {
      setError(tErr(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(t('settings.deleteCalendarConfirm', { name: calendar.name }))) return;
    try {
      await api(`/businesses/${biz.id}/calendars/${calendar.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (err) {
      setError(tErr(err));
    }
  };

  return (
    <div className="flex flex-col gap-5 border-t border-white/8 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label={t('settings.calName')}>
          <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label={t('settings.calColor')}>
          <input className="input" type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} />
        </Field>
      </div>
      <Field label={t('settings.calDescription')}>
        <input className="input" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.calCapacity')} hint={t('settings.calCapacityHint')}>
          <input className="input" type="number" min={1} max={500} value={d.capacity} onChange={(e) => setD({ ...d, capacity: e.target.value })} />
        </Field>
        <Field label={t('settings.calDuration')} hint={t('settings.calDurationHint')}>
          <input
            className="input"
            type="number"
            min={5}
            step={5}
            placeholder={String(biz.settings.defaultDuration)}
            value={d.defaultDuration}
            onChange={(e) => setD({ ...d, defaultDuration: e.target.value })}
          />
        </Field>
      </div>
      <Toggle checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t('settings.calActive')} />
      <div>
        <div className="mb-2 text-[12px] font-medium text-paper/65">{t('settings.hours')}</div>
        <HoursEditor value={d.hours} onChange={(hours) => setD({ ...d, hours })} />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4">
        <Button variant="danger" size="sm" onClick={remove}>
          <Trash width={14} height={14} /> {t('settings.deleteCalendar')}
        </Button>
        <Button variant="primary" onClick={save} disabled={busy}>
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

/** Working hours per weekday; several intervals per day allow lunch breaks. */
function HoursEditor({ value, onChange }) {
  const { t } = useI18n();
  const setDay = (day, list) => onChange({ ...value, [day]: list });
  return (
    <div className="flex flex-col divide-y divide-white/6 rounded-[14px] border border-white/8">
      {DAY_ORDER.map((day) => {
        const list = value[day] ?? [];
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="w-24 shrink-0">
              <Toggle
                checked={list.length > 0}
                onChange={(on) => setDay(day, on ? [['09:00', '17:00']] : [])}
                label={<span className="text-ui font-medium">{t(`days.${day}`)}</span>}
              />
            </div>
            {list.length === 0 ? (
              <span className="text-ui text-paper/35">{t('settings.dayOff')}</span>
            ) : (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {list.map(([a, b], i) => (
                  <div key={i} className="flex items-center gap-1">
                    <TimeInput className="h-8 w-[64px] px-2 text-center text-[13px]" value={a} onChange={(v) => setDay(day, list.map((r, j) => (j === i ? [v, r[1]] : r)))} />
                    <span className="text-paper/35">–</span>
                    <TimeInput className="h-8 w-[64px] px-2 text-center text-[13px]" value={b} onChange={(v) => setDay(day, list.map((r, j) => (j === i ? [r[0], v] : r)))} />
                    <button type="button" className="grid size-7 place-items-center rounded-full text-paper/45 hover:bg-white/10 hover:text-paper" onClick={() => setDay(day, list.filter((_, j) => j !== i))}>
                      <Close width={13} height={13} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDay(day, [...list, [list.at(-1)?.[1] ?? '13:00', '18:00']])}
                  className="grid size-7 place-items-center rounded-full border border-white/14 text-paper/60 hover:border-white/40 hover:text-paper"
                  title={t('settings.addInterval')}
                >
                  <Plus width={13} height={13} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      <div className="px-3 py-2">
        <button
          type="button"
          className="text-[12px] font-medium text-gold-light hover:text-gold"
          onClick={() => onChange({ ...value, tue: value.mon ?? [], wed: value.mon ?? [], thu: value.mon ?? [], fri: value.mon ?? [] })}
        >
          {t('settings.copyToAll')}
        </button>
      </div>
    </div>
  );
}

/* ───────── services ───────── */

function Services({ biz, setBiz }) {
  const { t, tErr } = useI18n();
  const toast = useToast();
  const replace = (services) => setBiz({ ...biz, services });
  const add = async () => {
    try {
      const s = await api(`/businesses/${biz.id}/services`, { method: 'POST', body: { name: t('settings.svcName'), duration: biz.settings.defaultDuration } });
      replace([...biz.services, s]);
    } catch (err) {
      toast(tErr(err));
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {biz.services.map((s) => (
        <ServiceRow key={s.id} biz={biz} service={s} onSaved={(ns) => replace(biz.services.map((x) => (x.id === ns.id ? ns : x)))} onDeleted={() => replace(biz.services.filter((x) => x.id !== s.id))} />
      ))}
      <div>
        <Button variant="outline" onClick={add}>
          <Plus width={15} height={15} /> {t('settings.addService')}
        </Button>
      </div>
    </div>
  );
}

function ServiceRow({ biz, service, onSaved, onDeleted }) {
  const { t, tErr } = useI18n();
  const toast = useToast();
  const [d, setD] = useState({ ...service, price: service.price ?? '' });
  const dirty = JSON.stringify(d) !== JSON.stringify({ ...service, price: service.price ?? '' });

  const save = async () => {
    try {
      onSaved(await api(`/businesses/${biz.id}/services/${service.id}`, { method: 'PATCH', body: { ...d, duration: Number(d.duration) } }));
      toast(t('settings.saved'));
    } catch (err) {
      toast(tErr(err));
    }
  };
  const remove = async () => {
    await api(`/businesses/${biz.id}/services/${service.id}`, { method: 'DELETE' });
    onDeleted();
  };
  const toggleCal = (id) => setD({ ...d, calendarIds: d.calendarIds.includes(id) ? d.calendarIds.filter((x) => x !== id) : [...d.calendarIds, id] });

  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_110px_110px_auto]">
        <Field label={t('settings.svcName')}>
          <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label={t('settings.svcDuration')}>
          <input className="input" type="number" min={5} step={5} value={d.duration} onChange={(e) => setD({ ...d, duration: e.target.value })} />
        </Field>
        <Field label={`${t('settings.svcPrice')} (${biz.settings.currency})`}>
          <input className="input" type="number" min={0} step="any" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} />
        </Field>
        <Field label={t('settings.svcColor')}>
          <div className="flex items-center gap-1">
            <input className="input" type="color" value={d.color || '#c9a96e'} onChange={(e) => setD({ ...d, color: e.target.value })} />
            {d.color && (
              <button type="button" className="grid size-7 place-items-center rounded-full text-paper/45 hover:bg-white/10" onClick={() => setD({ ...d, color: '' })}>
                <Close width={12} height={12} />
              </button>
            )}
          </div>
        </Field>
      </div>
      <div>
        <div className="mb-2 text-[12px] font-medium text-paper/65">{t('settings.svcCalendars')}</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setD({ ...d, calendarIds: [] })}
            className={cx('h-8 rounded-full border px-3 text-[12px] font-medium', d.calendarIds.length === 0 ? 'border-paper bg-paper text-ink' : 'border-white/14 text-paper/70')}
          >
            {t('settings.svcAllCalendars')}
          </button>
          {biz.calendars.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCal(c.id)}
              className={cx(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium',
                d.calendarIds.includes(c.id) ? 'border-paper bg-paper text-ink' : 'border-white/14 text-paper/70',
              )}
            >
              <span className="size-1.5 rounded-full" style={{ background: c.color }} /> {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4">
        <div className="flex items-center gap-4">
          <Toggle checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t('settings.svcActive')} />
          <button type="button" onClick={remove} className="text-[12px] text-paper/45 hover:text-danger">
            {t('settings.deleteService')}
          </button>
        </div>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={save}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

/* ───────── booking form (custom questions) ───────── */

function FormFields({ biz, setBiz }) {
  const { t } = useI18n();
  const { draft, setDraft, save, busy, error } = useBizDraft(biz, setBiz, (b) =>
    b.settings.customFields.map((f) => ({ ...f, optionsText: f.options.join(', ') })),
  );
  const set = (i, patch) => setDraft(draft.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const types = ['text', 'textarea', 'number', 'select', 'checkbox', 'date'];

  return (
    <Section
      lead={t('settings.formLead')}
      footer={
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => save({ settings: { customFields: draft.map(({ optionsText, ...f }) => ({ ...f, options: optionsText.split(',').map((o) => o.trim()).filter(Boolean) })) } })}
        >
          {t('settings.save')}
        </Button>
      }
    >
      {draft.map((f, i) => (
        <div key={f.id || i} className="flex flex-col gap-3 rounded-[14px] border border-white/8 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_170px_auto]">
            <Field label={t('settings.fieldLabel')}>
              <input className="input" value={f.label} onChange={(e) => set(i, { label: e.target.value })} />
            </Field>
            <Field label={t('settings.fieldType')}>
              <select className="input" value={f.type} onChange={(e) => set(i, { type: e.target.value })}>
                {types.map((k) => (
                  <option key={k} value={k}>
                    {t(`settings.fieldTypes.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end gap-2 pb-1">
              <Toggle checked={f.required} onChange={(v) => set(i, { required: v })} label={t('settings.fieldRequired')} />
              <IconButton size="sm" label={t('common.remove')} onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
                <Trash width={14} height={14} />
              </IconButton>
            </div>
          </div>
          {f.type === 'select' && (
            <Field label={t('settings.fieldOptions')}>
              <input className="input" value={f.optionsText} onChange={(e) => set(i, { optionsText: e.target.value })} />
            </Field>
          )}
        </div>
      ))}
      <div>
        <Button variant="outline" size="sm" onClick={() => setDraft([...draft, { id: '', label: '', type: 'text', required: false, optionsText: '' }])}>
          <Plus width={14} height={14} /> {t('settings.addField')}
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </Section>
  );
}

/* ───────── time off ───────── */

function TimeOff({ biz }) {
  const { t, tErr, locale } = useI18n();
  const toast = useToast();
  const isOwner = biz.me.role === 'owner';
  const today = nowIn(biz.settings.timezone).slice(0, 10);
  const [rows, setRows] = useState([]);
  const [d, setD] = useState({ calendarId: isOwner ? '' : String(biz.calendars[0]?.id ?? ''), start: `${today}T00:00`, end: `${addDays(today, 1)}T00:00`, reason: '' });

  const load = () => api(`/businesses/${biz.id}/timeoff?from=${today}T00:00`).then(setRows);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz.id]);

  const add = async () => {
    try {
      await api(`/businesses/${biz.id}/timeoff`, { method: 'POST', body: { ...d, calendarId: d.calendarId ? Number(d.calendarId) : null } });
      setD({ ...d, reason: '' });
      load();
    } catch (err) {
      toast(tErr(err));
    }
  };
  const remove = async (id) => {
    await api(`/businesses/${biz.id}/timeoff/${id}`, { method: 'DELETE' });
    load();
  };
  const calName = (id) => biz.calendars.find((c) => c.id === id)?.name ?? t('settings.toWholeBusiness');

  return (
    <div className="flex flex-col gap-4">
      <Section
        lead={t('settings.toLead')}
        footer={
          <Button variant="primary" onClick={add}>
            <Plus width={14} height={14} /> {t('settings.addTimeOff')}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.toWho')}>
            <select className="input" value={d.calendarId} onChange={(e) => setD({ ...d, calendarId: e.target.value })}>
              {isOwner && <option value="">{t('settings.toWholeBusiness')}</option>}
              {biz.calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('settings.toReason')} optional>
            <input className="input" value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} />
          </Field>
          <Field label={t('settings.toStart')}>
            <input className="input" type="datetime-local" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} />
          </Field>
          <Field label={t('settings.toEnd')}>
            <input className="input" type="datetime-local" value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} />
          </Field>
        </div>
      </Section>
      {rows.length === 0 ? (
        <p className="px-1 text-ui text-paper/45">{t('settings.toEmpty')}</p>
      ) : (
        <div className="card divide-y divide-white/6">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{r.reason || t('cal.timeOff')}</div>
                <div className="truncate text-[12px] text-paper/50">
                  {calName(r.calendarId)} · {fmt.full(r.start, locale)} → {fmt.full(r.end, locale)}
                </div>
              </div>
              {(isOwner || r.calendarId) && (
                <IconButton size="sm" label={t('common.delete')} onClick={() => remove(r.id)}>
                  <Trash width={14} height={14} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── labels & view ───────── */

function Appearance({ biz, setBiz }) {
  const { t } = useI18n();
  const { draft, setDraft, save, busy, error } = useBizDraft(biz, setBiz, (b) => ({ ...b.settings }));
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  return (
    <Section
      footer={
        <Button variant="primary" disabled={busy} onClick={() => save({ settings: draft })}>
          {t('settings.save')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.calendarLabel')} hint={t('settings.labelHint', { d: t(`calLabel.${biz.type}`) })}>
          <input className="input" placeholder={t(`calLabel.${biz.type}`)} value={draft.calendarLabel} onChange={(e) => set('calendarLabel', e.target.value)} />
        </Field>
        <Field label={t('settings.clientLabel')} hint={t('settings.labelHint', { d: t(`clientLabelDefault.${biz.type}`) })}>
          <input className="input" placeholder={t(`clientLabelDefault.${biz.type}`)} value={draft.clientLabel} onChange={(e) => set('clientLabel', e.target.value)} />
        </Field>
        <Field label={t('settings.dayStart')}>
          <TimeInput value={draft.dayStart} onChange={(v) => set('dayStart', v)} />
        </Field>
        <Field label={t('settings.dayEnd')}>
          <TimeInput value={draft.dayEnd} onChange={(v) => set('dayEnd', v)} />
        </Field>
        <Field label={t('settings.weekStart')}>
          <select className="input" value={draft.weekStart} onChange={(e) => set('weekStart', Number(e.target.value))}>
            <option value={1}>{t('settings.monday')}</option>
            <option value={0}>{t('settings.sunday')}</option>
          </select>
        </Field>
      </div>
      <Toggle checked={draft.hideCancelled} onChange={(v) => set('hideCancelled', v)} label={t('settings.hideCancelled')} />
      <ErrorNote>{error}</ErrorNote>
    </Section>
  );
}

/* ───────── team: staff logins ───────── */

const inviteUrl = (token) => `${window.location.origin}/join/${token}`;

function Team({ biz }) {
  const { t, tErr } = useI18n();
  const toast = useToast();
  const [members, setMembers] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState({ name: '', email: '', access: 'own', calendarIds: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api(`/businesses/${biz.id}/members`).then(setMembers);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz.id]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const m = await api(`/businesses/${biz.id}/members`, { method: 'POST', body: draft });
      setMembers((list) => [...(list ?? []), m].sort((a, b) => a.name.localeCompare(b.name)));
      setOpenId(m.id); // show the invite link straight away
      setDraft({ name: '', email: '', access: 'own', calendarIds: [] });
    } catch (err) {
      setError(tErr(err));
    } finally {
      setBusy(false);
    }
  };

  const replace = (m) => setMembers((list) => list.map((x) => (x.id === m.id ? m : x)));
  const removed = (id) => setMembers((list) => list.filter((x) => x.id !== id));

  return (
    <div className="flex flex-col gap-4">
      <Section lead={t('team.lead')}>
        <form onSubmit={add} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('team.name')}>
              <input className="input" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label={t('team.email')}>
              <input className="input" type="email" required value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </Field>
          </div>
          <AccessPicker biz={biz} value={draft} onChange={(v) => setDraft({ ...draft, ...v })} />
          <ErrorNote>{error}</ErrorNote>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={busy}>
              <Plus width={14} height={14} /> {t('team.add')}
            </Button>
          </div>
        </form>
      </Section>

      {members?.length === 0 && <p className="px-1 text-ui text-paper/45">{t('team.empty')}</p>}
      {members?.map((m) => (
        <MemberCard
          key={m.id}
          biz={biz}
          member={m}
          open={openId === m.id}
          onToggle={() => setOpenId(openId === m.id ? null : m.id)}
          onSaved={(x) => {
            replace(x);
            toast(t('settings.saved'));
          }}
          onRemoved={() => removed(m.id)}
          onError={(err) => toast(tErr(err))}
        />
      ))}
    </div>
  );
}

/** "Only their calendars" (+ which ones) or "All calendars". */
function AccessPicker({ biz, value, onChange }) {
  const { t } = useI18n();
  const toggle = (id) => onChange({ calendarIds: value.calendarIds.includes(id) ? value.calendarIds.filter((x) => x !== id) : [...value.calendarIds, id] });
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12px] font-medium text-paper/65">{t('team.access')}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {['own', 'all'].map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value.access === k}
            onClick={() => onChange({ access: k })}
            className={cx(
              'rounded-[16px] border p-4 text-left transition-[background,border-color] duration-300',
              value.access === k ? 'border-gold/70 bg-gold/10' : 'border-white/10 bg-ink-2 hover:border-white/30',
            )}
          >
            <span className="block text-[14px] font-semibold">{t(k === 'own' ? 'team.accessOwn' : 'team.accessAll')}</span>
            <span className="mt-0.5 block text-[12px] text-paper/50">{t(k === 'own' ? 'team.accessOwnDesc' : 'team.accessAllDesc')}</span>
          </button>
        ))}
      </div>
      {value.access === 'own' && (
        <div>
          <div className="mb-2 text-[12px] font-medium text-paper/65">{t('team.calendars')}</div>
          <div className="flex flex-wrap gap-1.5">
            {biz.calendars.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={value.calendarIds.includes(c.id)}
                onClick={() => toggle(c.id)}
                className={cx(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium',
                  value.calendarIds.includes(c.id) ? 'border-paper bg-paper text-ink' : 'border-white/14 text-paper/70',
                )}
              >
                <span className="size-1.5 rounded-full" style={{ background: c.color }} /> {c.name}
              </button>
            ))}
          </div>
          {value.calendarIds.length === 0 && <p className="mt-2 text-[12px] text-gold-light">{t('team.noCalendarsWarn')}</p>}
        </div>
      )}
    </div>
  );
}

function MemberCard({ biz, member, open, onToggle, onSaved, onRemoved, onError }) {
  const { t } = useI18n();
  const toast = useToast();
  const pick = (m) => ({ name: m.name, access: m.access, calendarIds: m.calendarIds });
  const [d, setD] = useState(() => pick(member));
  useEffect(() => setD(pick(member)), [member]);
  const dirty = JSON.stringify(d) !== JSON.stringify(pick(member));
  const calendars = biz.calendars.filter((c) => member.calendarIds.includes(c.id));
  // a reset link is shown once, right after it is made: only its fingerprint is kept on the server
  const [resetUrl, setResetUrl] = useState('');

  const call = async (path, method, body) => {
    try {
      return await api(`/businesses/${biz.id}/members/${member.id}${path}`, { method, body });
    } catch (err) {
      onError(err);
      return null;
    }
  };
  const save = async () => {
    const m = await call('', 'PATCH', d);
    if (m) onSaved(m);
  };
  const newLink = async () => {
    const m = await call('/invite', 'POST');
    if (m) onSaved(m);
  };
  const remove = async () => {
    if (!window.confirm(t('team.removeConfirm', { name: member.name }))) return;
    if (await call('', 'DELETE')) onRemoved();
  };
  const copy = async (url = inviteUrl(member.inviteToken)) => {
    if (await copyText(url)) toast(t('team.copied'));
    else window.prompt(t('common.copyManual'), url);
  };
  const makeReset = async () => {
    const r = await call('/reset', 'POST');
    if (r) setResetUrl(`${window.location.origin}/reset/${r.token}`);
  };

  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left md:px-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold/15 text-[14px] font-semibold text-gold-light">
          {member.name
            .split(/\s+/)
            .map((w) => w[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{member.name}</span>
            <span className={cx('size-1.5 shrink-0 rounded-full', member.status === 'active' ? 'bg-ready' : 'bg-building')} />
            <span className="shrink-0 text-[11px] text-paper/50">{t(member.status === 'active' ? 'team.active' : 'team.invited')}</span>
          </span>
          <span className="block truncate text-[12px] text-paper/50">
            {member.email} · {member.access === 'all' ? t('team.allCalendars') : calendars.map((c) => c.name).join(', ') || '—'}
          </span>
        </span>
        <ChevronDown width={16} height={16} className={cx('shrink-0 text-paper/50 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="flex flex-col gap-5 border-t border-white/8 p-4 md:p-5">
          {member.status === 'invited' && (
            <div className="rounded-[16px] border border-gold/40 bg-gold/[0.07] p-4">
              <div className="text-[14px] font-semibold">{t('team.inviteTitle', { name: member.name })}</div>
              <p className="mt-1 text-[12px] text-paper/55">{t('team.inviteHint', { name: member.name })}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input className="input min-w-0 flex-1 text-[13px]" readOnly value={inviteUrl(member.inviteToken)} onFocus={(e) => e.target.select()} />
                <Button variant="gold" onClick={() => copy()}>
                  <Copy width={14} height={14} /> {t('team.copyLink')}
                </Button>
              </div>
              <button type="button" onClick={newLink} className="mt-2 text-[12px] text-paper/50 hover:text-paper">
                {t('team.newLink')}
              </button>
            </div>
          )}
          <Field label={t('team.name')}>
            <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
          <AccessPicker biz={biz} value={d} onChange={(v) => setD({ ...d, ...v })} />
          {member.status === 'active' && (
            <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[14px] font-semibold">{t('reset.teamTitle')}</div>
              <p className="mt-1 text-[12px] text-paper/55">{t('reset.teamHint', { name: member.name })}</p>
              {resetUrl ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input className="input min-w-0 flex-1 text-[13px]" readOnly value={resetUrl} onFocus={(e) => e.target.select()} />
                  <Button variant="gold" onClick={() => copy(resetUrl)}>
                    <Copy width={14} height={14} /> {t('team.copyLink')}
                  </Button>
                </div>
              ) : (
                <Button className="mt-3" size="sm" variant="ghost" onClick={makeReset}>
                  {t('reset.make')}
                </Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4">
            <button type="button" onClick={remove} className="text-[12px] text-paper/45 hover:text-danger">
              {t('team.remove')}
            </button>
            <Button variant="primary" size="sm" disabled={!dirty} onClick={save}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── my account ───────── */

export function Account() {
  const { t, tErr, lang, setLang } = useI18n();
  const toast = useToast();
  const { user, updateMe } = useAuth();
  const [d, setD] = useState({ name: user.name, phone: user.phone, currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const save = async () => {
    setError('');
    try {
      await updateMe({ ...d, lang });
      setD({ ...d, currentPassword: '', newPassword: '' });
      toast(t('settings.saved'));
    } catch (err) {
      setError(tErr(err));
    }
  };
  return (
    <Section
      footer={
        <Button variant="primary" onClick={save}>
          {t('settings.save')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.accName')}>
          <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label={t('settings.accPhone')}>
          <input className="input" type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        </Field>
        <Field label={t('auth.email')}>
          <input className="input opacity-60" value={user.email} disabled />
        </Field>
        <Field label={t('settings.accLang')}>
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">English</option>
            <option value="ro">Română</option>
          </select>
        </Field>
      </div>
      <div className="border-t border-white/8 pt-4 text-[13px] font-semibold">{t('settings.changePassword')}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.currentPassword')}>
          <input className="input" type="password" autoComplete="current-password" value={d.currentPassword} onChange={(e) => setD({ ...d, currentPassword: e.target.value })} />
        </Field>
        <Field label={t('settings.newPassword')}>
          <input className="input" type="password" autoComplete="new-password" value={d.newPassword} onChange={(e) => setD({ ...d, newPassword: e.target.value })} />
        </Field>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </Section>
  );
}
