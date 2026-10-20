import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorNote, Field, PageLoader } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { Shell } from './Auth.jsx';

/** Someone opens the one-time link they were given and chooses a new password. */
export default function ResetPage() {
  const { token } = useParams();
  const { t, tErr } = useI18n();
  const navigate = useNavigate();
  const [who, setWho] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/auth/reset/${token}`)
      .then(setWho)
      .catch(() => setInvalid(true));
  }, [token]);

  if (invalid)
    return (
      <Shell eyebrow={t('reset.eyebrow')} title={t('reset.invalidTitle')}>
        <ErrorNote>{t('reset.invalid')}</ErrorNote>
      </Shell>
    );
  if (!who) return <PageLoader />;

  const submit = async (e) => {
    e.preventDefault();
    if (password !== again) return setError(t('reset.mismatch'));
    setBusy(true);
    setError('');
    try {
      const res = await api(`/auth/reset/${token}`, { method: 'POST', body: { password } });
      navigate('/login', { replace: true, state: { email: res.email, reset: true } });
    } catch (err) {
      setError(tErr(err));
      setBusy(false);
    }
  };

  return (
    <Shell eyebrow={t('reset.eyebrow')} title={t('reset.title', { name: who.name })}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-ui text-paper/60">{t('reset.lead')}</p>
        <Field label={t('auth.email')}>
          <input className="input opacity-70" value={who.email} autoComplete="username" readOnly />
        </Field>
        <Field label={t('reset.password')} hint={t('auth.passwordHint')}>
          <input className="input" type="password" required minLength={8} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t('reset.again')}>
          <input className="input" type="password" required minLength={8} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" variant="gold" size="lg" disabled={busy}>
          {t('reset.submit')}
        </Button>
      </form>
    </Shell>
  );
}
