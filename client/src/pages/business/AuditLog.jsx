import { useCallback, useEffect, useState } from 'react';
import { Button, ErrorNote, LoadLine, cx } from '../../components/ui.jsx';
import { api, qs } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';
import { deviceName } from './SecurityPanel.jsx';

const PAGE = 60;
// what deserves a second look: red; changes: gold; ordinary logins: green
const RED = new Set(['login_failed', 'login_code_failed', 'patient_deleted', 'payment_deleted', 'refund', 'business_deleted', 'calendar_deleted', 'company_deleted', 'member_removed', '2fa_disabled', 'patients_merged']);
const GREEN = new Set(['login', 'logout', 'register', 'invite_accepted', '2fa_enabled']);
// the detail is who the action was done to, so it reads as one sentence: "removed from the team Ana"
const OBJECT = new Set(['member_added', 'member_access', 'member_removed', 'patient_deleted', 'reset_link']);

const when = (iso, locale) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** One short line saying what exactly was touched. */
function describe(e, t, currency, locale) {
  const d = e.detail ?? {};
  switch (e.action) {
    case 'patient_deleted':
    case 'calendar_deleted':
    case 'company_deleted':
    case 'member_added':
    case 'member_removed':
    case 'reset_link':
      return d.name ?? '';
    case 'member_access':
      return `${d.name} · ${t(d.access === 'all' ? 'audit.accessAll' : 'audit.accessOwn')}`;
    case 'patients_merged':
      return `${d.removed?.name} → ${d.kept?.name}`;
    case 'payment_deleted':
      return `${money(d.amount, currency, locale)} · ${t(`pay.methods.${d.method}`)}`;
    case 'refund':
      return money(d.amount, currency, locale);
    case 'business_updated':
      return (d.fields ?? []).join(', ');
    case 'invite_accepted':
      return d.member ?? '';
    case 'login':
      return d.method === 'backup' ? t('audit.withBackup') : d.method === 'code' ? t('audit.withCode') : '';
    case 'messaging_settings':
      return d.tokenChanged ? t('audit.tokenChanged') : '';
    default:
      return '';
  }
}

/** Owner only: logins of the whole team and every sensitive change, newest first. */
export default function AuditLog({ biz }) {
  const { t, tErr, locale } = useI18n();
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (before = 0) => {
      setBusy(true);
      try {
        const page = await api(`/businesses/${biz.id}/audit${qs({ limit: PAGE, before: before || undefined })}`);
        setRows((cur) => (before ? [...(cur ?? []), ...page] : page));
        setMore(page.length === PAGE);
      } catch (err) {
        setError(tErr(err));
      }
      setBusy(false);
    },
    [biz.id, tErr],
  );
  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="card p-5 md:p-6">
      <h2 className="text-[18px] leading-6 font-semibold tracking-[-0.01em]">{t('audit.title')}</h2>
      <p className="mt-1 text-ui text-paper/55">{t('audit.lead')}</p>
      <div className="mt-5">
        <ErrorNote>{error}</ErrorNote>
        {!rows ? (
          busy && <LoadLine />
        ) : rows.length === 0 ? (
          <p className="text-ui text-paper/50">{t('audit.empty')}</p>
        ) : (
          <ul className="divide-y divide-white/8 rounded-[12px] border border-white/8">
            {rows.map((e) => {
              const what = describe(e, t, biz.settings.currency, locale);
              return (
                <li key={e.id} className="flex gap-3 px-3 py-2.5">
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', RED.has(e.action) ? 'bg-coral' : GREEN.has(e.action) ? 'bg-ready' : 'bg-gold')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-ui">
                      <span className={cx('font-semibold', !e.userName && 'text-paper/55 italic')}>{e.userName ?? t('audit.goneUser')}</span>{' '}
                      <span className="text-paper/75">{t(`audit.actions.${e.action}`, { action: e.action })}</span>
                      {what && (OBJECT.has(e.action) ? <span className="font-medium"> {what}</span> : <span className="text-paper/60"> · {what}</span>)}
                    </span>
                    <span className="block truncate text-[12px] text-paper/45">
                      {when(e.at, locale)} · {deviceName(e.userAgent)} · {e.ip}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {more && (
          <div className="mt-3 flex justify-center">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => load(rows[rows.length - 1].id)}>
              {t('audit.more')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
