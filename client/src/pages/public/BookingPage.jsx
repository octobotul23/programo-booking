import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SiteHeader from '../../components/SiteHeader.jsx';
import { Button, ErrorNote, Eyebrow, Field, IconButton, PageLoader, buttonClass, cx } from '../../components/ui.jsx';
import { Calendar, Check, ChevronLeft, ChevronRight, Clock, Mail, Phone, Pin, TYPE_ICONS, Users } from '../../components/icons.jsx';
import { CustomFieldInput } from '../../components/CustomFields.jsx';
import { api, qs } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { addDays, fmt } from '../../lib/dates.js';
import { useI18n } from '../../lib/i18n.jsx';

const STRIP = 14;

export default function BookingPage() {
  const { slug } = useParams();
  const { t, tErr, locale } = useI18n();
  const { user } = useAuth();
  const [biz, setBiz] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [calendarId, setCalendarId] = useState(null);
  const [serviceId, setServiceId] = useState(null);
  const [stripStart, setStripStart] = useState(null);
  const [counts, setCounts] = useState({});
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState(null);
  const [form, setForm] = useState({ clientName: '', clientPhone: '', clientEmail: '', notes: '', custom: {} });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api(`/public/b/${slug}`)
      .then((b) => {
        setBiz(b);
        setStripStart(b.today);
        if (b.calendars.length === 1) setCalendarId(b.calendars[0].id);
      })
      .catch((e) => setLoadError(tErr(e)));
  }, [slug, tErr]);

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, clientName: f.clientName || user.name, clientPhone: f.clientPhone || user.phone, clientEmail: f.clientEmail || user.email }));
  }, [user]);

  const services = useMemo(() => (biz?.services ?? []).filter((s) => !s.calendarIds.length || s.calendarIds.includes(calendarId)), [biz, calendarId]);
  const needsService = services.length > 0;
  const calendar = biz?.calendars.find((c) => c.id === calendarId);
  const service = services.find((s) => s.id === serviceId);
  const ready = calendarId && (!needsService || serviceId);

  // availability counts for the date strip
  useEffect(() => {
    if (!ready || !stripStart || biz?.settings.bookingMode !== 'public') return;
    let alive = true;
    api(`/public/b/${slug}/availability${qs({ calendarId, serviceId, from: stripStart, days: STRIP })}`)
      .then((c) => alive && setCounts(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, slug, calendarId, serviceId, stripStart, biz]);

  // slots for the chosen day
  useEffect(() => {
    if (!ready || !date) return;
    let alive = true;
    setSlots(null);
    setTime(null);
    api(`/public/b/${slug}/availability${qs({ calendarId, serviceId, date })}`)
      .then((s) => alive && setSlots(s))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [ready, slug, calendarId, serviceId, date]);

  if (loadError)
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-[560px] px-5 pt-36">
          <ErrorNote>{loadError}</ErrorNote>
        </main>
      </>
    );
  if (!biz) return <PageLoader />;

  const s = biz.settings;
  const TypeIcon = TYPE_ICONS[biz.type] ?? Calendar;
  const calLabel = s.calendarLabel || t(`calLabel.${biz.type}`);
  const lastDay = addDays(biz.today, s.maxDaysAhead);
  const price = (p) => (p === null || p === undefined ? '' : Number(p) === 0 ? t('book.free') : `${p} ${s.currency}`);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const appt = await api(`/public/b/${slug}/book`, { method: 'POST', body: { calendarId, serviceId, date, time, ...form } });
      setDone(appt);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(tErr(err));
      if (err.code === 'slot_taken') {
        setTime(null);
        api(`/public/b/${slug}/availability${qs({ calendarId, serviceId, date })}`).then(setSlots);
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDone(null);
    setTime(null);
    setDate(null);
    setSlots(null);
  };

  return (
    <>
      <SiteHeader />
      <main className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_at_25%_0%,var(--glow),transparent_60%),radial-gradient(ellipse_at_90%_20%,var(--glow-2),transparent_50%)]" />
        <div className="relative mx-auto max-w-[1100px] px-5 pt-32 pb-24 md:px-10">
          {/* business hero */}
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <Eyebrow className="flex items-center gap-2">
                <TypeIcon width={14} height={14} /> {t(`types.${biz.type}`)}
              </Eyebrow>
              <h1 className="mt-3 text-[clamp(36px,6vw,72px)] leading-[0.95] font-semibold tracking-[-0.045em]">{biz.name}</h1>
              {biz.description && <p className="mt-4 max-w-[640px] text-body text-paper/60">{biz.description}</p>}
            </div>
            <div className="flex flex-col gap-1.5 text-ui text-paper/60">
              {biz.address && (
                <span className="flex items-center gap-2">
                  <Pin width={15} height={15} /> {biz.address}
                </span>
              )}
              {biz.phone && (
                <a href={`tel:${biz.phone}`} className="flex items-center gap-2 hover:text-paper">
                  <Phone width={15} height={15} /> {biz.phone}
                </a>
              )}
              {biz.email && (
                <a href={`mailto:${biz.email}`} className="flex items-center gap-2 hover:text-paper">
                  <Mail width={15} height={15} /> {biz.email}
                </a>
              )}
            </div>
          </div>
          {s.welcomeMessage && <div className="glass mt-8 rounded-[20px] px-5 py-4 text-ui whitespace-pre-line text-paper/80">{s.welcomeMessage}</div>}

          {s.bookingMode !== 'public' ? (
            <div className="card mt-10 p-8 text-center">
              <h2 className="text-[22px] font-semibold">{t('book.disabledTitle')}</h2>
              <p className="mt-2 text-ui text-paper/55">{t('book.disabledLead')}</p>
              {biz.phone && (
                <a href={`tel:${biz.phone}`} className={buttonClass('gold', 'lg', 'mt-6')}>
                  <Phone width={16} height={16} /> {biz.phone}
                </a>
              )}
            </div>
          ) : s.requireAccount && !user ? (
            <div className="card mt-10 p-8 text-center">
              <p className="text-body text-paper/70">{t('book.accountRequired')}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Link to={`/register?role=client&next=/b/${slug}`} className={buttonClass('gold', 'lg')}>
                  {t('nav.register')}
                </Link>
                <Link to={`/login?next=/b/${slug}`} className={buttonClass('outline', 'lg')}>
                  {t('nav.login')}
                </Link>
              </div>
            </div>
          ) : done ? (
            <div className="glass mx-auto mt-12 max-w-[560px] animate-pop rounded-[28px] p-8 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-gold text-ink">
                <Check width={26} height={26} />
              </span>
              <h2 className="mt-5 text-[30px] leading-9 font-semibold tracking-[-0.02em]">{done.status === 'pending' ? t('book.pendingTitle') : t('book.successTitle')}</h2>
              <p className="mt-2 text-ui text-paper/60">{done.status === 'pending' ? t('book.pendingLead') : t('book.successLead')}</p>
              <div className="mt-6 rounded-[16px] border border-white/10 bg-white/[0.03] p-4 text-left">
                <div className="text-[18px] font-semibold first-letter:uppercase">{fmt.full(done.start, locale)}</div>
                <div className="mt-1 text-ui text-paper/60">{[service?.name, calendar?.name, biz.name].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {user?.role === 'client' && (
                  <Link to="/me" className={buttonClass('primary')}>
                    {t('book.myAppointments')}
                  </Link>
                )}
                <Button variant="outline" onClick={reset}>
                  {t('book.bookAnother')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_340px]">
              <div className="flex flex-col gap-10">
                {/* 1 — who */}
                {biz.calendars.length > 1 && (
                  <Step n={1} title={calLabel}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {biz.calendars.map((c) => (
                        <OptionCard
                          key={c.id}
                          active={calendarId === c.id}
                          onClick={() => {
                            setCalendarId(c.id);
                            setServiceId(null);
                            setDate(null);
                          }}
                        >
                          <span className="size-3 shrink-0 rounded-full" style={{ background: c.color }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                            {c.description && <span className="block truncate text-[12px] text-paper/50">{c.description}</span>}
                          </span>
                          {c.capacity > 1 && <Users width={16} height={16} className="text-paper/40" />}
                        </OptionCard>
                      ))}
                    </div>
                  </Step>
                )}

                {/* 2 — what */}
                {calendarId && needsService && (
                  <Step n={biz.calendars.length > 1 ? 2 : 1} title={t('book.chooseService')}>
                    <div className="flex flex-col gap-2">
                      {services.map((sv) => (
                        <OptionCard
                          key={sv.id}
                          active={serviceId === sv.id}
                          onClick={() => {
                            setServiceId(sv.id);
                            setDate(null);
                          }}
                        >
                          {sv.color && <span className="size-3 shrink-0 rounded-full" style={{ background: sv.color }} />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold">{sv.name}</span>
                            <span className="flex items-center gap-1.5 text-[12px] text-paper/50">
                              <Clock width={12} height={12} /> {t('book.minutes', { n: sv.duration })}
                            </span>
                          </span>
                          {s.showPrices && sv.price !== null && <span className="text-[15px] font-light tabular-nums">{price(sv.price)}</span>}
                        </OptionCard>
                      ))}
                    </div>
                  </Step>
                )}

                {/* 3 — when */}
                {ready && (
                  <Step n={(biz.calendars.length > 1 ? 1 : 0) + (needsService ? 1 : 0) + 1} title={t('book.chooseDate')}>
                    <div className="flex items-center gap-2">
                      <IconButton size="sm" label="←" disabled={stripStart <= biz.today} onClick={() => setStripStart(addDays(stripStart, -STRIP) < biz.today ? biz.today : addDays(stripStart, -STRIP))}>
                        <ChevronLeft width={16} height={16} />
                      </IconButton>
                      <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto py-1">
                        {Array.from({ length: STRIP }, (_, i) => addDays(stripStart, i))
                          .filter((d) => d <= lastDay)
                          .map((d) => {
                            const n = counts[d];
                            const off = n === 0;
                            return (
                              <button
                                key={d}
                                type="button"
                                disabled={off}
                                onClick={() => setDate(d)}
                                className={cx(
                                  'flex w-[62px] shrink-0 flex-col items-center gap-0.5 rounded-[16px] border py-2.5 transition-[background,border-color,color] duration-300',
                                  date === d ? 'border-gold bg-gold text-ink' : off ? 'border-white/6 text-paper/25' : 'border-white/12 hover:border-white/40',
                                )}
                              >
                                <span className="text-[11px] font-medium uppercase opacity-70">{fmt.weekdayShort(d, locale)}</span>
                                <span className="text-[20px] leading-6 font-semibold tabular-nums">{fmt.dayNum(d)}</span>
                                <span className={cx('size-1 rounded-full', off ? 'bg-transparent' : date === d ? 'bg-ink' : 'bg-ready')} />
                              </button>
                            );
                          })}
                      </div>
                      <IconButton size="sm" label="→" disabled={addDays(stripStart, STRIP) > lastDay} onClick={() => setStripStart(addDays(stripStart, STRIP))}>
                        <ChevronRight width={16} height={16} />
                      </IconButton>
                    </div>

                    {date && (
                      <div className="mt-6">
                        <div className="mb-3 text-ui font-medium text-paper/70 first-letter:uppercase">
                          {t('book.chooseTime')} · {fmt.long(date, locale)}
                        </div>
                        {slots === null ? (
                          <div className="h-10" />
                        ) : slots.length === 0 ? (
                          <p className="text-ui text-paper/45">{t('book.noSlots')}</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                            {slots.map((sl) => (
                              <button
                                key={sl.time}
                                type="button"
                                onClick={() => setTime(sl.time)}
                                className={cx(
                                  'flex h-12 flex-col items-center justify-center rounded-[12px] border text-[15px] font-semibold tabular-nums transition-[background,border-color] duration-300',
                                  time === sl.time ? 'border-gold bg-gold text-ink' : 'border-white/12 hover:border-white/40',
                                )}
                              >
                                {sl.time}
                                {calendar?.capacity > 1 && <span className="text-[10px] font-medium opacity-60">{t('book.places', { n: sl.spots })}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Step>
                )}

                {/* 4 — who are you */}
                {time && (
                  <Step n={(biz.calendars.length > 1 ? 1 : 0) + (needsService ? 1 : 0) + 2} title={t('book.yourDetails')}>
                    <form onSubmit={submit} className="flex flex-col gap-4">
                      {user && <div className="text-ui text-paper/55">{t('book.loggedInAs', { name: user.name })}</div>}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t('auth.name')} className="sm:col-span-2">
                          <input className="input" required autoComplete="name" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
                        </Field>
                        <Field label={t('auth.phone')} optional={!s.requirePhone}>
                          <input className="input" type="tel" autoComplete="tel" required={s.requirePhone} value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
                        </Field>
                        <Field label={t('auth.email')} optional={!s.requireEmail}>
                          <input className="input" type="email" autoComplete="email" required={s.requireEmail} value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
                        </Field>
                        {s.customFields.map((f) => (
                          <CustomFieldInput key={f.id} field={f} showRequired value={form.custom[f.id]} onChange={(v) => setForm({ ...form, custom: { ...form.custom, [f.id]: v } })} />
                        ))}
                        <Field label={t('appt.notes')} optional className="sm:col-span-2">
                          <textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                        </Field>
                      </div>
                      <ErrorNote>{error}</ErrorNote>
                      <div>
                        <Button type="submit" variant="gold" size="lg" disabled={busy}>
                          {busy ? t('book.sending') : t('book.confirm')}
                        </Button>
                      </div>
                    </form>
                  </Step>
                )}
              </div>

              {/* summary */}
              <aside className="glass h-fit rounded-[24px] p-5 lg:sticky lg:top-24">
                <Eyebrow className="text-paper/45">{t('book.summary')}</Eyebrow>
                <dl className="mt-4 flex flex-col gap-3 text-ui">
                  <Row label={calLabel} value={calendar?.name} dot={calendar?.color} />
                  {needsService && <Row label={t('appt.service')} value={service && `${service.name} · ${t('book.minutes', { n: service.duration })}`} />}
                  <Row label={t('appt.date')} value={date && fmt.medium(date, locale)} />
                  <Row label={t('appt.time')} value={time} />
                  {s.showPrices && service?.price !== null && service?.price !== undefined && <Row label={t('settings.svcPrice')} value={price(service.price)} />}
                </dl>
                {s.requireApproval && <p className="mt-4 border-t border-white/8 pt-4 text-[12px] text-paper/50">{t('onboarding.modeApprovalDesc')}</p>}
              </aside>
            </div>
          )}

          <p className="mt-16 text-center text-[12px] text-paper/30">
            {t('book.poweredBy')} <span className="font-light">Pro</span>
            <span className="font-semibold">gramo</span>
          </p>
        </div>
      </main>
    </>
  );
}

function Step({ n, title, children }) {
  return (
    <section className="animate-fade-up">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-7 place-items-center rounded-full border border-gold/50 text-[12px] font-semibold text-gold-light tabular-nums">{n}</span>
        <h2 className="text-[20px] leading-6 font-semibold tracking-[-0.01em] first-letter:uppercase">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function OptionCard({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex w-full items-center gap-3 rounded-[16px] border p-4 text-left transition-[background,border-color] duration-300',
        active ? 'border-gold/70 bg-gold/10' : 'border-white/10 bg-ink-2 hover:border-white/30',
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, value, dot }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-paper/45">{label}</dt>
      <dd className={cx('flex items-center gap-2 text-right font-medium', !value && 'text-paper/25')}>
        {dot && value && <span className="size-2 rounded-full" style={{ background: dot }} />}
        {value || '—'}
      </dd>
    </div>
  );
}
