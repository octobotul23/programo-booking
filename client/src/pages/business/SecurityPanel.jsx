import { useState } from 'react';
import qrcode from 'qrcode-generator';
import { Panel, useApi } from '../../components/clinic.jsx';
import { Button, ErrorNote, Field, LoadLine, Modal, cx } from '../../components/ui.jsx';
import { Check, Copy, Download, Shield } from '../../components/icons.jsx';
import { api } from '../../lib/api.js';
import { copyText, saveErrorKey, saveTextFile } from '../../lib/device.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';

/** "Chrome · Windows" from a user-agent string — enough to recognise your own devices. */
export function deviceName(ua = '') {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  // the phone app adds "ProgramoApp" to its WebView's name (capacitor.config.json)
  const br = /ProgramoApp/.test(ua)
    ? 'Programo app'
    : /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : /node|curl|undici/i.test(ua)
                ? 'Script'
                : '';
  return [br, os].filter(Boolean).join(' · ') || '—';
}

/** The QR code drawn as plain SVG squares (no HTML injected into the page). */
function Qr({ text, size = 184 }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cells = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(`M${c + 2} ${r + 2}h1v1h-1z`);
  return (
    <svg viewBox={`0 0 ${n + 4} ${n + 4}`} width={size} height={size} className="rounded-[10px]" role="img" aria-label="QR">
      <rect width={n + 4} height={n + 4} fill="#fff" />
      <path d={cells.join('')} fill="#000" shapeRendering="crispEdges" />
    </svg>
  );
}

const when = (iso, locale) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function SecurityPanel() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/auth/security', []);
  const [modal, setModal] = useState(null); // 'enable' | 'disable' | 'backup'
  const [codes, setCodes] = useState(null);

  const endSession = async (id) => {
    await api(`/auth/sessions/${id}`, { method: 'DELETE' });
    toast(t('sec.sessionEnded'));
    reload();
  };
  const endOthers = async () => {
    if (!window.confirm(t('sec.endOthersConfirm'))) return;
    await api('/auth/sessions/end-others', { method: 'POST' });
    toast(t('sec.sessionEnded'));
    reload();
  };

  return (
    <Panel title={t('sec.title')}>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data ? (
        loading && <LoadLine />
      ) : (
        <div className="flex flex-col gap-6">
          {/* two-factor */}
          <section className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span className={cx('grid size-10 shrink-0 place-items-center rounded-full', data.twoFactor ? 'bg-ready/15 text-ready' : 'bg-coral/15 text-coral')}>
              <Shield width={20} height={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-ui font-semibold">
                {t('sec.twoFactor')}{' '}
                <span className={cx('ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', data.twoFactor ? 'bg-ready/15 text-ready' : 'bg-white/8 text-paper/60')}>
                  {data.twoFactor ? t('sec.on') : t('sec.off')}
                </span>
              </h3>
              <p className="mt-1 text-[12px] leading-5 text-paper/60">{data.twoFactor ? t('sec.onLead', { n: data.backupLeft }) : t('sec.offLead')}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {data.twoFactor ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setModal('backup')}>
                    {t('sec.newBackup')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setModal('disable')}>
                    {t('sec.turnOff')}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="primary" onClick={() => setModal('enable')}>
                  {t('sec.turnOn')}
                </Button>
              )}
            </div>
          </section>

          {/* devices */}
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <h3 className="text-ui font-semibold whitespace-nowrap">{t('sec.devices')}</h3>
              {data.sessions.length > 1 && (
                <Button size="sm" variant="ghost" onClick={endOthers}>
                  {t('sec.endOthers')}
                </Button>
              )}
            </div>
            <ul className="divide-y divide-white/8 rounded-[12px] border border-white/8">
              {data.sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui font-medium">
                      {deviceName(s.userAgent)}
                      {s.current && <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-light">{t('sec.thisDevice')}</span>}
                    </span>
                    <span className="block truncate text-[12px] text-paper/50">
                      {t('sec.lastActive', { when: when(s.lastSeen, locale) })} · {s.ip}
                    </span>
                  </span>
                  {!s.current && (
                    <Button size="sm" variant="ghost" onClick={() => endSession(s.id)}>
                      {t('sec.logOut')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* recent logins */}
          {data.logins.length > 0 && (
            <section>
              <h3 className="mb-2 text-ui font-semibold">{t('sec.recent')}</h3>
              <ul className="flex flex-col gap-1.5 text-[12px]">
                {data.logins.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={cx('size-2 rounded-full', l.action === 'login' ? 'bg-ready' : 'bg-coral')} />
                    <span className="font-medium">{t(`sec.events.${l.action}`)}</span>
                    <span className="text-paper/50">
                      {when(l.at, locale)} · {deviceName(l.userAgent)} · {l.ip}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-paper/45">{t('sec.recentHint')}</p>
            </section>
          )}
        </div>
      )}

      {modal === 'enable' && <EnableModal onClose={() => setModal(null)} onDone={(c) => (setModal(null), setCodes(c), reload())} />}
      {modal === 'disable' && <PasswordCodeModal mode="disable" onClose={() => setModal(null)} onDone={() => (setModal(null), toast(t('sec.disabled')), reload())} />}
      {modal === 'backup' && <PasswordCodeModal mode="backup" onClose={() => setModal(null)} onDone={(c) => (setModal(null), setCodes(c), reload())} />}
      {codes && <BackupCodes codes={codes} onClose={() => setCodes(null)} />}
    </Panel>
  );
}

function EnableModal({ onClose, onDone }) {
  const { t, tErr } = useI18n();
  const [step, setStep] = useState('password');
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (step === 'password') {
        setSetup(await api('/auth/2fa/setup', { method: 'POST', body: { password } }));
        setStep('scan');
      } else {
        const res = await api('/auth/2fa/enable', { method: 'POST', body: { code } });
        onDone(res.backupCodes);
      }
    } catch (err) {
      setError(tErr(err));
    }
    setBusy(false);
  };

  return (
    <Modal open title={t('sec.enableTitle')} onClose={onClose}>
      <form onSubmit={run} className="flex flex-col gap-4">
        {step === 'password' ? (
          <>
            <p className="text-ui leading-6 text-paper/65">{t('sec.enableLead')}</p>
            <Field label={t('sec.password')}>
              <input className="input" type="password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-ui leading-6 text-paper/70">
              <li>{t('sec.step1')}</li>
              <li>{t('sec.step2')}</li>
              <li>{t('sec.step3')}</li>
            </ol>
            <div className="flex flex-col items-center gap-2">
              <Qr text={setup.uri} />
              {/* on a phone the authenticator app opens straight from this link */}
              <a href={setup.uri} className="text-[12px] font-medium text-gold-light hover:underline sm:hidden">
                {t('sec.openApp')}
              </a>
              <code className="rounded-[8px] bg-white/6 px-2 py-1 text-[12px] tracking-wider break-all select-all">{setup.secret.match(/.{1,4}/g).join(' ')}</code>
            </div>
            <Field label={t('sec.code')}>
              <input
                className="input text-center text-[20px] tracking-[0.3em] tabular-nums"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          </>
        )}
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {step === 'password' ? t('common.next') : t('sec.verify')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Turning two-factor off, or new backup codes: both need the password (and a code to turn off). */
function PasswordCodeModal({ mode, onClose, onDone }) {
  const { t, tErr } = useI18n();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api(`/auth/2fa/${mode}`, { method: 'POST', body: { password, code } });
      onDone(res.backupCodes);
    } catch (err) {
      setError(tErr(err));
      setBusy(false);
    }
  };
  return (
    <Modal open title={mode === 'disable' ? t('sec.disableTitle') : t('sec.newBackup')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-ui leading-6 text-paper/65">{mode === 'disable' ? t('sec.disableLead') : t('sec.backupLead')}</p>
        <Field label={t('sec.password')}>
          <input className="input" type="password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {mode === 'disable' && (
          <Field label={t('sec.codeOrBackup')}>
            <input className="input tabular-nums" inputMode="numeric" autoComplete="one-time-code" required maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        )}
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant={mode === 'disable' ? 'danger' : 'primary'} disabled={busy}>
            {mode === 'disable' ? t('sec.turnOff') : t('sec.newBackup')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BackupCodes({ codes, onClose }) {
  const { t } = useI18n();
  const toast = useToast();
  const text = `Programo — ${t('sec.backupTitle')}\n\n${codes.join('\n')}\n`;
  // if copying fails the codes stay on screen to write down
  const copy = async () => {
    if (await copyText(text, { sensitive: true })) toast(t('common.copied'));
  };
  const save = () => saveTextFile('programo-backup-codes.txt', 'text/plain', text).catch((e) => toast(t(saveErrorKey(e, 'common.saveFailed'))));
  return (
    <Modal open title={t('sec.backupTitle')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-ui leading-6 text-paper/65">{t('sec.backupShowLead')}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-[12px] bg-white/5 p-3 font-mono text-[15px] tracking-wider">
          {codes.map((c) => (
            <li key={c} className="text-center select-all">
              {c}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={copy}>
            <Copy width={14} height={14} /> {t('common.copy')}
          </Button>
          <Button variant="ghost" size="sm" onClick={save}>
            <Download width={14} height={14} /> {t('sec.saveFile')}
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            <Check width={14} height={14} /> {t('sec.savedThem')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
