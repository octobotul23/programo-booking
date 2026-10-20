import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '../../components/SiteHeader.jsx';
import { Button, Empty, Eyebrow, Segmented, StatusBadge, buttonClass } from '../../components/ui.jsx';
import { ArrowUpRight, Calendar, Phone, Pin, Search, TYPE_ICONS } from '../../components/icons.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { fmt } from '../../lib/dates.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';
import { Account } from '../business/SettingsPage.jsx';

export default function ClientHome() {
  const { t, tErr, locale } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [appts, setAppts] = useState(null);
  const [tab, setTab] = useState('upcoming');
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);

  const load = () => api('/me/appointments').then(setAppts);
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const id = setTimeout(() => api(`/public/businesses?q=${encodeURIComponent(q)}`).then(setFound).catch(() => {}), 200);
    return () => clearTimeout(id);
  }, [q]);

  // naive "now" in the browser's zone is fine to split upcoming / past for display
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const upcoming = (appts ?? []).filter((a) => a.end >= nowStr && ['pending', 'confirmed'].includes(a.status)).reverse();
  const past = (appts ?? []).filter((a) => !(a.end >= nowStr && ['pending', 'confirmed'].includes(a.status)));
  const list = tab === 'upcoming' ? upcoming : tab === 'past' ? past : null;

  const cancel = async (a) => {
    if (!window.confirm(t('client.cancelConfirm'))) return;
    try {
      await api(`/me/appointments/${a.id}/cancel`, { method: 'POST' });
      toast(t('status.cancelled'));
      load();
    } catch (err) {
      toast(tErr(err));
    }
  };

  return (
    <>
      <SiteHeader />
      <main className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_20%_0%,var(--glow),transparent_60%)]" />
        <div className="relative mx-auto max-w-[1100px] px-5 pt-32 pb-20 md:px-10">
          <Eyebrow>{t('nav.myAppointments')}</Eyebrow>
          <h1 className="mt-3 text-[clamp(36px,6vw,64px)] leading-[0.95] tracking-[-0.04em]">
            <span className="font-light">{t('client.hello')}</span>{' '}
            <span className="font-semibold">{user.name.split(' ')[0]}</span>
          </h1>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
            <section>
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'upcoming', label: `${t('client.upcoming')} · ${upcoming.length}` },
                  { value: 'past', label: t('client.past') },
                  { value: 'account', label: t('nav.account') },
                ]}
              />
              <div className="mt-4 flex flex-col gap-3">
                {tab === 'account' ? (
                  <Account />
                ) : appts === null ? null : list.length === 0 ? (
                  <Empty icon={Calendar}>{t('client.none')}</Empty>
                ) : (
                  list.map((a) => (
                    <article key={a.id} className="card flex flex-col gap-4 p-5" style={{ borderLeft: `3px solid ${a.calendarColor}` }}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[20px] leading-6 font-semibold tracking-[-0.01em] first-letter:uppercase">{fmt.full(a.start, locale)}</div>
                          <div className="mt-1 text-ui text-paper/60">
                            {[a.serviceName, a.calendarName].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-paper/60">
                        <Link to={`/b/${a.business.slug}`} className="font-semibold text-paper hover:text-gold-light">
                          {a.business.name}
                        </Link>
                        {a.business.address && (
                          <span className="flex items-center gap-1.5">
                            <Pin width={13} height={13} /> {a.business.address}
                          </span>
                        )}
                        {a.business.phone && (
                          <a href={`tel:${a.business.phone}`} className="flex items-center gap-1.5 hover:text-paper">
                            <Phone width={13} height={13} /> {a.business.phone}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {tab === 'upcoming' ? (
                          <Button size="sm" variant="outline" onClick={() => cancel(a)}>
                            {t('client.cancel')}
                          </Button>
                        ) : (
                          <Link to={`/b/${a.business.slug}`} className={buttonClass('outline', 'sm')}>
                            {t('client.bookAgain')}
                          </Link>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="glass h-fit rounded-[24px] p-5 md:p-6">
              <h2 className="text-[20px] leading-6 font-semibold tracking-[-0.01em]">{t('client.findTitle')}</h2>
              <p className="mt-1.5 text-ui text-paper/55">{t('client.findLead')}</p>
              <label className="relative mt-4 block">
                <Search width={16} height={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-paper/40" />
                <input className="input pl-9" placeholder={t('client.search')} value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <div className="mt-3 flex flex-col gap-1.5">
                {found.length === 0 && <div className="px-1 py-4 text-ui text-paper/40">{t('client.noResults')}</div>}
                {found.map((b) => {
                  const Icon = TYPE_ICONS[b.type] ?? Calendar;
                  return (
                    <Link
                      key={b.id}
                      to={`/b/${b.slug}`}
                      className="group flex items-center gap-3 rounded-[14px] border border-white/8 bg-white/[0.02] p-3 transition-colors hover:border-white/25"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/12 text-gold-light">
                        <Icon width={16} height={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{b.name}</span>
                        <span className="block truncate text-[12px] text-paper/45">{b.address || t(`types.${b.type}`)}</span>
                      </span>
                      <ArrowUpRight width={15} height={15} className="text-paper/40 transition-transform group-hover:rotate-45" />
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
