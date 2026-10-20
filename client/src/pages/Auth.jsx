import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader.jsx';
import { Button, ErrorNote, Eyebrow, Field, PageLoader, cx } from '../components/ui.jsx';
import { Calendar, User } from '../components/icons.jsx';
import { homeFor, useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';

export function Shell({ eyebrow, title, children }) {
  return (
    <>
      <SiteHeader />
      <main className="relative grid min-h-dvh place-items-center px-4 pt-24 pb-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,var(--glow),transparent_60%)]" />
        <div className="glass relative w-full max-w-[460px] animate-pop rounded-[24px] p-6 sm:p-8">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-2 text-[30px] leading-9 font-semibold tracking-[-0.02em]">{title}</h1>
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </>
  );
}

/** Only follow same-site relative paths after login (no open redirects). Browsers read "/\x" like "//x". */
const safeNext = (next) => (next && next.startsWith('/') && !/^\/[/\\]/.test(next) ? next : null);

export function Login() {
  const { t, tErr } = useI18n();
  const { loading, user, businesses, login, loginCode } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // arriving from a reset link: the email is filled in and a note says the new password is set
  const { state } = useLocation();
  const [form, setForm] = useState({ email: state?.email ?? '', password: '', code: '' });
  const [forgot, setForgot] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get('next'));

  if (loading) return <PageLoader />;
  if (user) return <Navigate to={next || homeFor(user, businesses)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = ticket ? await loginCode(ticket, form.code) : await login(form.email, form.password);
      if (data.twoFactor) {
        setTicket(data.ticket);
        setBusy(false);
        return;
      }
      navigate(next || homeFor(data.user, data.businesses), { replace: true });
    } catch (err) {
      // the 5 minutes for the code ran out: start again from the password
      if (err.code === 'login_expired') {
        setTicket(null);
        setForm((f) => ({ ...f, code: '' }));
      }
      setError(tErr(err));
      setBusy(false);
    }
  };

  if (ticket) {
    return (
      <Shell eyebrow={t('appName')} title={t('sec.codeTitle')}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-ui leading-6 text-paper/65">{t('sec.codeLead')}</p>
          <Field label={t('sec.code')}>
            <input
              className="input text-center text-[22px] tracking-[0.3em] tabular-nums"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={12}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          <p className="text-[12px] text-paper/50">{t('sec.codeBackupHint')}</p>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
            {t('sec.verify')}
          </Button>
          <button type="button" className="text-ui text-paper/55 hover:text-paper" onClick={() => (setTicket(null), setError(''))}>
            {t('common.back')}
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell eyebrow={t('appName')} title={t('auth.loginTitle')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {state?.reset && <p className="rounded-[12px] border border-ready/30 bg-ready/10 px-3 py-2.5 text-ui text-paper/80">{t('reset.done')}</p>}
        <Field label={t('auth.email')}>
          <input className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label={t('auth.password')}>
          <input className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <button type="button" onClick={() => setForgot(!forgot)} className="-mt-2 self-end text-[12px] text-paper/55 hover:text-paper" aria-expanded={forgot}>
          {t('reset.forgot')}
        </button>
        {forgot && <p className="-mt-1 rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[13px] leading-5 text-paper/65">{t('reset.forgotHelp')}</p>}
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" variant="primary" size="lg" disabled={busy} className="mt-2 w-full">
          {t('auth.submitLogin')}
        </Button>
        <p className="text-center text-ui text-paper/55">
          {t('auth.noAccount')}{' '}
          <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-gold-light hover:text-gold">
            {t('nav.register')}
          </Link>
        </p>
      </form>
    </Shell>
  );
}

export function Register() {
  const { t, tErr, lang } = useI18n();
  const { loading, user, businesses, register } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  // someone arriving from a booking page is a client
  const initialRole = params.get('role') === 'business' ? 'business' : params.get('role') === 'client' || next?.startsWith('/b/') ? 'client' : 'business';
  const [form, setForm] = useState({ role: initialRole, name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader />;
  if (user) return <Navigate to={next || homeFor(user, businesses)} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await register({ ...form, lang });
      navigate(next || (data.user.role === 'business' ? '/onboarding' : '/me'), { replace: true });
    } catch (err) {
      setError(tErr(err));
      setBusy(false);
    }
  };

  const roles = [
    ['business', Calendar, t('auth.business'), t('auth.businessDesc')],
    ['client', User, t('auth.client'), t('auth.clientDesc')],
  ];

  return (
    <Shell eyebrow={t('appName')} title={t('auth.registerTitle')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-paper/65">{t('auth.iAm')}</div>
          <div className="grid grid-cols-2 gap-2">
            {roles.map(([value, Icon, label, desc]) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, role: value })}
                aria-pressed={form.role === value}
                className={cx(
                  'flex flex-col items-start gap-2 rounded-[16px] border p-3.5 text-left transition-[background,border-color] duration-300',
                  form.role === value ? 'border-gold/70 bg-gold/10' : 'border-white/12 hover:border-white/30 hover:bg-white/[0.03]',
                )}
              >
                <Icon width={18} height={18} className={form.role === value ? 'text-gold-light' : 'text-paper/60'} />
                <span className="text-[14px] leading-5 font-semibold">{label}</span>
                <span className="text-[11px] leading-4 text-paper/50">{desc}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label={t('auth.name')}>
          <input className="input" autoComplete="name" required value={form.name} onChange={set('name')} />
        </Field>
        <Field label={t('auth.email')}>
          <input className="input" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </Field>
        <Field label={t('auth.phone')} optional>
          <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set('password')} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" variant="primary" size="lg" disabled={busy} className="mt-2 w-full">
          {t('auth.submitRegister')}
        </Button>
        <p className="text-center text-ui text-paper/55">
          {t('auth.haveAccount')}{' '}
          <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-gold-light hover:text-gold">
            {t('nav.login')}
          </Link>
        </p>
      </form>
    </Shell>
  );
}
