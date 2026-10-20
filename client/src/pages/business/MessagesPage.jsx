import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { DataTable, DateRange, Dot, Page, PageHead, Panel, Td, thisMonth, useApi } from '../../components/clinic.jsx';
import { Button, Empty, ErrorNote, Field, LoadLine, Segmented, Toggle, cx } from '../../components/ui.jsx';
import { Check, ChevronLeft, ChevronRight, Message, Shield, Whatsapp } from '../../components/icons.jsx';
import { api, qs } from '../../lib/api.js';
import { addDays, fmt, nowIn } from '../../lib/dates.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';
import { MessageModal } from './clinicModals.jsx';

const VARS = ['name', 'date', 'time', 'doctor', 'service', 'business', 'address', 'phone'];

export default function MessagesPage() {
  const { biz } = useOutletContext();
  const { t } = useI18n();
  const isOwner = biz.me.role === 'owner';
  const [tab, setTab] = useState('reminders');
  const tabs = ['reminders', 'history', ...(isOwner ? ['settings'] : [])];
  return (
    <Page className="max-w-[1200px]">
      <PageHead title={t('menu.messages')} sub={t('msg.lead')} />
      <div className="no-scrollbar mt-4 flex gap-1 overflow-x-auto border-b border-white/10">
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cx('-mb-px shrink-0 border-b-2 px-4 py-2.5 text-ui font-medium', tab === k ? 'border-gold text-gold-light' : 'border-transparent text-paper/60 hover:text-paper')}
          >
            {t(`msg.tabs.${k}`)}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'reminders' && <Reminders biz={biz} />}
        {tab === 'history' && <History biz={biz} />}
        {tab === 'settings' && <MessageSettings />}
      </div>
    </Page>
  );
}

function Reminders({ biz }) {
  const { t, locale } = useI18n();
  const today = nowIn(biz.settings.timezone).slice(0, 10);
  const [date, setDate] = useState(addDays(today, 1));
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useApi(`/businesses/${biz.id}/messages/reminders${qs({ date })}`, [tick]);
  const [compose, setCompose] = useState(null);
  const rows = data?.rows ?? [];
  const done = rows.filter((a) => a.remindedAt).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label={t('cal.prev')}>
          <ChevronLeft width={16} height={16} />
        </Button>
        <input type="date" className="input h-9 w-[160px] py-0" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <Button variant="ghost" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label={t('cal.next')}>
          <ChevronRight width={16} height={16} />
        </Button>
        <span className="text-ui font-medium">{fmt.long(date, locale)}</span>
        {rows.length > 0 && <span className="ml-auto text-[12px] text-paper/55">{t('msg.remindedOf', { done, n: rows.length })}</span>}
      </div>
      {rows.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
          <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${(done / rows.length) * 100}%` }} />
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data ? (
        loading && <LoadLine />
      ) : rows.length === 0 ? (
        <Empty icon={Message}>{t('msg.noBookings')}</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((a) => (
            <li key={a.id} className={cx('card flex flex-wrap items-center gap-3 p-3', a.remindedAt && 'opacity-70')}>
              <span className="w-12 text-[15px] font-semibold tabular-nums">{fmt.time(a.start)}</span>
              <Dot color={a.calendarColor} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-semibold">
                  {a.patientId ? (
                    <Link to={`../patients/${a.patientId}`} relative="path" className="hover:underline">
                      {a.clientName}
                    </Link>
                  ) : (
                    a.clientName
                  )}
                </span>
                <span className="block truncate text-[12px] text-paper/50">
                  {[a.clientPhone || t('msg.noPhone'), a.calendarName, a.serviceName].filter(Boolean).join(' · ')}
                </span>
                {/* under the name, so a phone row keeps room for the name itself */}
                {a.remindedAt ? (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-ready/15 px-2 py-0.5 text-[11px] font-semibold text-ready">
                    <Check width={12} height={12} /> {t('msg.remindedAt', { time: fmt.time(a.remindedAt) })}
                  </span>
                ) : !a.consent ? (
                  <span className="mt-1 block text-[11px] text-paper/45">{t('msg.noConsentShort')}</span>
                ) : null}
              </span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" disabled={!a.clientPhone} onClick={() => setCompose({ appointment: a, channel: 'whatsapp' })}>
                  <Whatsapp width={14} height={14} /> {a.remindedAt ? t('msg.again') : t('msg.remind')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {compose && (
        <MessageModal
          biz={biz}
          appointment={compose.appointment}
          kind="reminder"
          onClose={() => setCompose(null)}
          onSent={() => setTick((x) => x + 1)}
        />
      )}
    </div>
  );
}

function History({ biz }) {
  const { t, locale } = useI18n();
  const [range, setRange] = useState(() => thisMonth(biz));
  const { data, error } = useApi(`/businesses/${biz.id}/messages${qs(range)}`);
  return (
    <div className="flex flex-col gap-4">
      <DateRange biz={biz} value={range} onChange={setRange} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data ? (
        <LoadLine />
      ) : data.length === 0 ? (
        <Empty icon={Message}>{t('msg.empty')}</Empty>
      ) : (
        <div className="card">
          <DataTable head={[t('pay.when'), t('pay.patient'), t('msg.channel'), t('msg.kind'), t('msg.text'), t('msg.statusCol')]}>
            {data.map((x) => (
              <tr key={x.id} className="align-top">
                <Td className="whitespace-nowrap">{fmt.full(x.createdAt, locale)}</Td>
                <Td>
                  {x.patientId ? (
                    <Link to={`../patients/${x.patientId}`} relative="path" className="font-medium hover:underline">
                      {x.patientName}
                    </Link>
                  ) : (
                    '—'
                  )}
                  <span className="block text-[11px] text-paper/45">{x.toPhone}</span>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    {x.channel === 'whatsapp' ? <Whatsapp width={14} height={14} /> : <Message width={14} height={14} />}
                    {x.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                  </span>
                </Td>
                <Td>{t(`msg.kinds.${x.kind}`)}</Td>
                <Td className="max-w-[360px]">
                  <span className="line-clamp-2 text-[12px] text-paper/70">{x.body}</span>
                </Td>
                <Td>
                  <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', x.status === 'failed' ? 'bg-coral/15 text-danger' : x.status === 'sent' ? 'bg-ready/15 text-ready' : 'bg-white/8')}>
                    {t(`msg.status.${x.status}`)}
                  </span>
                </Td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
    </div>
  );
}

function MessageSettings() {
  const { biz, setBiz } = useOutletContext();
  const { t, tErr, lang } = useI18n();
  const toast = useToast();
  const [d, setD] = useState(() => ({ ...biz.settings.messaging, templates: { ...biz.settings.messaging?.templates } }));
  const [prov, setProv] = useState(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/businesses/${biz.id}/messages/settings${qs({ lang })}`)
      .then(setProv)
      .catch((e) => setError(tErr(e)));
  }, [biz.id, lang, tErr]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await api(`/businesses/${biz.id}`, { method: 'PATCH', body: { settings: { messaging: d } } });
      setBiz(next);
      const res = await api(`/businesses/${biz.id}/messages/settings`, {
        method: 'PATCH',
        body: { provider: prov.provider, twilioSid: prov.twilioSid, smsFrom: prov.smsFrom, whatsappFrom: prov.whatsappFrom, ...(token ? { twilioToken: token } : {}) },
      });
      setProv({ ...prov, ready: res.ready, hasToken: prov.hasToken || !!token });
      setToken('');
      toast(t('settings.saved'));
    } catch (e) {
      setError(tErr(e));
    }
    setBusy(false);
  };
  const clearToken = async () => {
    await api(`/businesses/${biz.id}/messages/settings`, { method: 'PATCH', body: { clearToken: true } });
    setProv({ ...prov, hasToken: false, ready: false });
  };

  if (!prov) return error ? <ErrorNote>{error}</ErrorNote> : <LoadLine />;
  const tpl = (k) => (
    <Field label={t(`msg.kinds.${k}`)} hint={t('msg.tplHint')}>
      <textarea
        className="input min-h-[96px]"
        maxLength={600}
        placeholder={prov.defaults[k]}
        value={d.templates?.[k] ?? ''}
        onChange={(e) => setD({ ...d, templates: { ...d.templates, [k]: e.target.value } })}
      />
    </Field>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={t('msg.sendingTitle')}>
        <div className="flex flex-col gap-4">
          <Field label={t('msg.defaultChannel')}>
            <Segmented
              value={d.channel}
              onChange={(v) => setD({ ...d, channel: v })}
              options={[
                { value: 'whatsapp', label: 'WhatsApp', icon: <Whatsapp width={14} height={14} /> },
                { value: 'sms', label: 'SMS', icon: <Message width={14} height={14} /> },
              ]}
            />
          </Field>
          <Field label={t('msg.countryCode')} hint={t('msg.countryHint')}>
            <input className="input w-[120px]" inputMode="numeric" maxLength={4} value={d.countryCode} onChange={(e) => setD({ ...d, countryCode: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label={t('msg.provider')}>
            <Segmented
              value={prov.provider}
              onChange={(v) => setProv({ ...prov, provider: v })}
              options={[
                { value: 'manual', label: t('msg.providerManual') },
                { value: 'twilio', label: 'Twilio' },
              ]}
            />
          </Field>
          <p className="text-[12px] leading-5 text-paper/55">{prov.provider === 'manual' ? t('msg.manualHint') : t('msg.twilioHint')}</p>
          {prov.provider === 'twilio' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account SID">
                <input className="input font-mono text-[12px]" autoComplete="off" value={prov.twilioSid} onChange={(e) => setProv({ ...prov, twilioSid: e.target.value.trim() })} />
              </Field>
              <Field label="Auth token" hint={prov.hasToken ? t('msg.tokenSaved') : t('msg.tokenHint')}>
                <input className="input font-mono text-[12px]" type="password" autoComplete="new-password" placeholder={prov.hasToken ? '••••••••' : ''} value={token} onChange={(e) => setToken(e.target.value.trim())} />
              </Field>
              <Field label={t('msg.smsFrom')} optional>
                <input className="input" type="tel" value={prov.smsFrom} onChange={(e) => setProv({ ...prov, smsFrom: e.target.value })} />
              </Field>
              <Field label={t('msg.waFrom')} optional>
                <input className="input" type="tel" value={prov.whatsappFrom} onChange={(e) => setProv({ ...prov, whatsappFrom: e.target.value })} />
              </Field>
              {prov.hasToken && (
                <button type="button" onClick={clearToken} className="w-fit text-[12px] text-danger hover:underline">
                  {t('msg.clearToken')}
                </button>
              )}
            </div>
          )}
          <div className={cx('flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12px]', prov.ready ? 'bg-ready/12 text-ready' : 'bg-white/5 text-paper/60')}>
            <Shield width={15} height={15} /> {prov.ready ? t('msg.ready') : t('msg.notReady')}
          </div>
          <Toggle
            checked={d.autoReminder}
            disabled={!prov.ready}
            onChange={(v) => setD({ ...d, autoReminder: v })}
            label={t('msg.autoReminder')}
            description={t('msg.autoReminderHint', { h: d.reminderHours })}
          />
          {d.autoReminder && (
            <Field label={t('msg.hoursBefore')}>
              <input className="input w-[120px]" type="number" min={1} max={168} value={d.reminderHours} onChange={(e) => setD({ ...d, reminderHours: Number(e.target.value) })} />
            </Field>
          )}
        </div>
      </Panel>
      <Panel title={t('msg.templatesTitle')}>
        <div className="flex flex-col gap-4">
          <p className="text-[12px] leading-5 text-paper/55">{t('msg.templatesLead')}</p>
          <div className="flex flex-wrap gap-1.5">
            {VARS.map((v) => (
              <code key={v} className="rounded-md bg-white/8 px-1.5 py-0.5 text-[11px]">{`{${v}}`}</code>
            ))}
          </div>
          {tpl('reminder')}
          {tpl('confirmation')}
        </div>
      </Panel>
      <div className="flex flex-col items-end gap-2 lg:col-span-2">
        <ErrorNote>{error}</ErrorNote>
        <Button variant="primary" onClick={save} disabled={busy}>
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}
