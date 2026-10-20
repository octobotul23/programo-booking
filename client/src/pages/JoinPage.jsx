import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorNote, Field, PageLoader } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Shell } from './Auth.jsx';

/** A team member opens the link the owner sent them and sets up their login. */
export default function JoinPage() {
  const { token } = useParams();
  const { t, tErr, lang } = useI18n();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [form, setForm] = useState({ password: '', phone: '', code: '' });
  // an existing account with two-step login also types its 6-digit code
  const [needCode, setNeedCode] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/auth/invite/${token}`)
      .then(setInvite)
      .catch(() => setInvalid(true));
  }, [token]);

  if (invalid)
    return (
      <Shell eyebrow={t('join.eyebrow')} title="—">
        <ErrorNote>{t('join.invalid')}</ErrorNote>
      </Shell>
    );
  if (!invite) return <PageLoader />;

  const vars = { business: invite.business.name, name: invite.name, email: invite.email };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api(`/auth/invite/${token}`, { method: 'POST', body: { ...form, lang } });
      await refresh();
      navigate(`/app/${res.businessId}`, { replace: true });
    } catch (err) {
      if (err.code === 'code_required') {
        setNeedCode(true);
        setError('');
      } else setError(tErr(err));
      setBusy(false);
    }
  };

  return (
    <Shell eyebrow={t('join.eyebrow')} title={t('join.title', vars)}>
      {invite.blocked ? (
        <ErrorNote>{t('join.blocked', vars)}</ErrorNote>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-ui text-paper/60">{t(invite.hasAccount ? 'join.leadExisting' : 'join.lead', vars)}</p>
          <Field label={t('auth.email')}>
            <input className="input opacity-70" value={invite.email} readOnly />
          </Field>
          {!invite.hasAccount && (
            <Field label={t('join.phone')} optional>
              <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          )}
          <Field label={t(invite.hasAccount ? 'join.passwordExisting' : 'join.password')}>
            <input
              className="input"
              type="password"
              required
              minLength={invite.hasAccount ? undefined : 8}
              autoComplete={invite.hasAccount ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          {needCode && (
            <Field label={t('sec.codeOrBackup')} hint={t('sec.codeBackupHint')}>
              <input
                className="input text-center text-[20px] tracking-[0.3em]"
                autoFocus
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={20}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
          )}
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" variant="gold" size="lg" disabled={busy}>
            {t('join.submit')}
          </Button>
        </form>
      )}
    </Shell>
  );
}
