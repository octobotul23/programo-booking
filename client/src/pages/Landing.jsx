import { Link, Navigate } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader.jsx';
import { buttonClass, Eyebrow, PageLoader, StatusBadge } from '../components/ui.jsx';
import { ArrowRight, Calendar, Clock, Columns, Globe, TYPE_ICONS, Users } from '../components/icons.jsx';
import { homeFor, useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';

const TYPES = ['clinic', 'dental', 'gym', 'salon', 'spa', 'physio', 'vet', 'tutoring'];

export default function Landing() {
  const { t } = useI18n();
  const { loading, user, businesses } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to={homeFor(user, businesses)} replace />;

  const features = [
    [Columns, t('landing.f1t'), t('landing.f1d')],
    [Clock, t('landing.f2t'), t('landing.f2d')],
    [Globe, t('landing.f3t'), t('landing.f3d')],
    [Users, t('landing.f4t'), t('landing.f4d')],
  ];

  return (
    <>
      <SiteHeader />
      <main className="relative overflow-hidden">
        {/* indigo night glow behind the hero, like the One globe backdrop */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px] bg-[radial-gradient(ellipse_at_30%_0%,var(--glow),transparent_60%),radial-gradient(ellipse_at_85%_30%,var(--glow-2),transparent_50%)]" />
        <section className="relative mx-auto max-w-[1400px] px-5 pt-36 pb-20 md:px-10 md:pt-48">
          <Eyebrow className="animate-fade-up">{t('landing.eyebrow')}</Eyebrow>
          <h1 className="mt-5 max-w-[1000px] animate-fade-up text-[clamp(44px,8vw,112px)] leading-[0.92] tracking-[-0.05em] [animation-delay:80ms]">
            <span className="font-light">{t('landing.titleLight')}</span> <span className="font-semibold">{t('landing.titleBold')}</span>
          </h1>
          <p className="mt-7 max-w-[640px] animate-fade-up text-lead text-paper/65 [animation-delay:160ms]">{t('landing.lead')}</p>
          <div className="mt-10 flex animate-fade-up flex-wrap gap-3 [animation-delay:240ms]">
            <Link to="/register?role=business" className={buttonClass('gold', 'lg')}>
              {t('landing.ctaBusiness')} <ArrowRight width={16} height={16} />
            </Link>
            <Link to="/register?role=client" className={buttonClass('outline', 'lg')}>
              {t('landing.ctaClient')}
            </Link>
          </div>

          {/* preview card: a slice of the calendar */}
          <div className="glass mt-16 max-w-[880px] animate-fade-up rounded-[24px] p-4 [animation-delay:320ms] md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-ui text-paper/70">
                <Calendar width={16} height={16} /> 09:00 — 12:00
              </div>
              <div className="flex gap-1.5">
                <StatusBadge status="confirmed" />
                <StatusBadge status="pending" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                ['#c9a96e', 'Dr. Ionescu', [['09:00', 'Maria P.', 'Consultation'], ['10:30', 'Andrei V.', 'Follow-up']]],
                ['#a9a4e6', 'Dr. Marin', [['09:30', 'Elena D.', 'Consultation'], ['11:00', 'Radu S.', 'Extended']]],
                ['#8fd6b0', 'Group HIIT', [['10:00', '8 / 12', 'Group class']]],
              ].map(([color, name, items], i) => (
                <div key={name} className={i === 2 ? 'hidden md:block' : ''}>
                  <div className="mb-2 flex items-center gap-2 text-ui font-semibold">
                    <span className="size-2 rounded-full" style={{ background: color }} /> {name}
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map(([time, who, what]) => (
                      <div key={time} className="rounded-[12px] border-l-2 bg-white/[0.04] px-3 py-2" style={{ borderColor: color }}>
                        <div className="text-[11px] text-paper/50 tabular-nums">{time}</div>
                        <div className="text-ui font-medium">{who}</div>
                        <div className="text-[11px] text-paper/50">{what}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative mx-auto max-w-[1400px] border-t border-white/8 px-5 py-16 md:px-10 md:py-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(([Icon, title, desc]) => (
              <div key={title} className="card p-6">
                <span className="grid size-10 place-items-center rounded-full bg-gold/12 text-gold-light">
                  <Icon width={18} height={18} />
                </span>
                <h3 className="mt-5 text-[18px] leading-6 font-semibold tracking-[-0.01em]">{title}</h3>
                <p className="mt-2 text-ui text-paper/55">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="relative mx-auto max-w-[1400px] border-t border-white/8 px-5 py-16 md:px-10 md:py-20">
          <Eyebrow className="text-paper/45">{t('landing.madeFor')}</Eyebrow>
          <div className="mt-6 flex flex-wrap gap-2">
            {TYPES.map((k) => {
              const Icon = TYPE_ICONS[k];
              return (
                <span key={k} className="inline-flex h-11 items-center gap-2.5 rounded-full border border-white/12 px-4 text-ui text-paper/80">
                  <Icon width={17} height={17} className="text-gold-light" /> {t(`types.${k}`)}
                </span>
              );
            })}
          </div>
        </section>

        <footer className="border-t border-white/8 px-5 py-8 text-center text-[12px] text-paper/35 md:px-10">
          © {new Date().getFullYear()} Programo · {t('tagline')}
        </footer>
      </main>
    </>
  );
}
