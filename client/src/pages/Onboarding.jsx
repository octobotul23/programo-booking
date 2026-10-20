import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ErrorNote, Eyebrow, Field, IconButton, LangSwitch, Wordmark, cx } from '../components/ui.jsx';
import { ArrowRight, ChevronLeft, Close, Globe, Plus, TYPE_ICONS, User, Check } from '../components/icons.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';

const TYPES = ['clinic', 'dental', 'gym', 'salon', 'spa', 'physio', 'vet', 'tutoring', 'other'];

export default function Onboarding() {
  const { t, tErr, lang } = useI18n();
  const { refresh, businesses, logout } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [presets, setPresets] = useState(null);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [calendars, setCalendars] = useState([]);
  const [mode, setMode] = useState('public');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/public/presets').then(setPresets).catch(() => setPresets({}));
  }, []);

  const chooseType = (k) => {
    setType(k);
    setCalendars((presets?.[k] ?? [{ name: { en: 'Calendar 1', ro: 'Calendar 1' } }]).map((c) => ({ name: c.name[lang] ?? c.name.en, capacity: c.capacity ?? 1 })));
    setStep(2);
  };

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      const biz = await api('/businesses', {
        method: 'POST',
        body: {
          name,
          type,
          lang,
          calendars: calendars.filter((c) => c.name.trim()),
          bookingMode: mode === 'staff_only' ? 'staff_only' : 'public',
          requireApproval: mode === 'approval',
        },
      });
      await refresh();
      navigate(`/app/${biz.id}`, { replace: true });
    } catch (err) {
      setError(tErr(err));
      setBusy(false);
    }
  };

  const modes = [
    ['staff_only', User, t('onboarding.modeStaff'), t('onboarding.modeStaffDesc')],
    ['public', Globe, t('onboarding.modePublic'), t('onboarding.modePublicDesc')],
    ['approval', Check, t('onboarding.modeApproval'), t('onboarding.modeApprovalDesc')],
  ];

  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(ellipse_at_50%_0%,var(--glow),transparent_65%)]" />
      <header className="relative mx-auto flex h-20 max-w-[1100px] items-center justify-between px-5">
        <Wordmark />
        <div className="flex items-center gap-1">
          {businesses.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/app/${businesses[0].id}`)}>
              {t('common.cancel')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={logout}>
            {t('nav.logout')}
          </Button>
          <LangSwitch />
        </div>
      </header>

      <main className="relative mx-auto max-w-[1100px] px-5 pt-6 pb-20">
        <div className="mb-8 flex items-center gap-3">
          {step > 1 && (
            <IconButton size="sm" label={t('common.back')} onClick={() => setStep(step - 1)}>
              <ChevronLeft width={16} height={16} />
            </IconButton>
          )}
          <Eyebrow>{t('onboarding.step', { n: step })}</Eyebrow>
          <div className="ml-2 flex gap-1.5">
            {[1, 2, 3].map((n) => (
              <span key={n} className={cx('h-1 w-8 rounded-full transition-colors duration-500', n <= step ? 'bg-gold' : 'bg-white/12')} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <section className="animate-fade-up">
            <h1 className="text-[clamp(32px,5vw,56px)] leading-[1] font-semibold tracking-[-0.035em]">{t('onboarding.chooseType')}</h1>
            <p className="mt-4 max-w-[620px] text-body text-paper/60">{t('onboarding.chooseTypeLead')}</p>
            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TYPES.map((k) => {
                const Icon = TYPE_ICONS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => chooseType(k)}
                    disabled={!presets}
                    className={cx(
                      'group flex flex-col items-start gap-6 rounded-[20px] border p-5 text-left transition-[background,border-color,transform] duration-300 ease-out-expo hover:-translate-y-0.5',
                      type === k ? 'border-gold/70 bg-gold/10' : 'border-white/10 bg-ink-2 hover:border-white/25',
                    )}
                  >
                    <span className="grid size-11 place-items-center rounded-full bg-white/6 text-gold-light transition-colors group-hover:bg-gold group-hover:text-ink">
                      <Icon width={20} height={20} />
                    </span>
                    <span className="text-[16px] leading-5 font-semibold tracking-[-0.01em]">{t(`types.${k}`)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="max-w-[640px] animate-fade-up">
            <h1 className="text-[clamp(32px,5vw,56px)] leading-[1] font-semibold tracking-[-0.035em]">{t('onboarding.nameTitle')}</h1>
            <p className="mt-4 text-body text-paper/60">{t('onboarding.nameLead')}</p>
            <div className="mt-10 flex flex-col gap-6">
              <Field label={t('onboarding.businessName')}>
                <input className="input h-12 text-[16px]" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <div>
                <div className="mb-2 flex items-baseline justify-between text-[12px] font-medium text-paper/65">
                  <span>{t('onboarding.calendars')}</span>
                  <span>{t('onboarding.capacity')}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {calendars.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: ['#c9a96e', '#a9a4e6', '#8fd6b0', '#f3b8a0', '#b8c9ff', '#e2cc9c'][i % 6] }} />
                      <input
                        className="input"
                        value={c.name}
                        onChange={(e) => setCalendars(calendars.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      />
                      <input
                        className="input w-20 shrink-0 text-center"
                        type="number"
                        min={1}
                        max={500}
                        value={c.capacity}
                        onChange={(e) => setCalendars(calendars.map((x, j) => (j === i ? { ...x, capacity: e.target.value } : x)))}
                      />
                      <IconButton size="sm" label={t('common.remove')} disabled={calendars.length <= 1} onClick={() => setCalendars(calendars.filter((_, j) => j !== i))}>
                        <Close width={14} height={14} />
                      </IconButton>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setCalendars([...calendars, { name: `${t(`calLabel.${type}`)} ${calendars.length + 1}`, capacity: 1 }])}
                >
                  <Plus width={14} height={14} /> {t('onboarding.addCalendar')}
                </Button>
              </div>
              <div>
                <Button variant="primary" size="lg" disabled={!name.trim() || !calendars.some((c) => c.name.trim())} onClick={() => setStep(3)}>
                  {t('common.next')} <ArrowRight width={16} height={16} />
                </Button>
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="max-w-[720px] animate-fade-up">
            <h1 className="text-[clamp(32px,5vw,56px)] leading-[1] font-semibold tracking-[-0.035em]">{t('onboarding.bookingTitle')}</h1>
            <p className="mt-4 text-body text-paper/60">{t('onboarding.bookingLead')}</p>
            <div className="mt-10 flex flex-col gap-3">
              {modes.map(([value, Icon, label, desc]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={cx(
                    'flex items-start gap-4 rounded-[20px] border p-5 text-left transition-[background,border-color] duration-300',
                    mode === value ? 'border-gold/70 bg-gold/10' : 'border-white/10 bg-ink-2 hover:border-white/25',
                  )}
                >
                  <span className={cx('grid size-10 shrink-0 place-items-center rounded-full', mode === value ? 'bg-gold text-ink' : 'bg-white/6 text-paper/70')}>
                    <Icon width={18} height={18} />
                  </span>
                  <span>
                    <span className="block text-[16px] leading-6 font-semibold">{label}</span>
                    <span className="mt-0.5 block text-ui text-paper/55">{desc}</span>
                  </span>
                </button>
              ))}
              <ErrorNote>{error}</ErrorNote>
              <div className="mt-4">
                <Button variant="gold" size="lg" disabled={busy} onClick={finish}>
                  {t('onboarding.finish')} <ArrowRight width={16} height={16} />
                </Button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
