import { useEffect, useMemo, useState } from 'react';
import { Button, ErrorNote, Field, Modal, Segmented, Toggle } from '../../components/ui.jsx';
import { Card, Cash, Message, Send, Whatsapp } from '../../components/icons.jsx';
import { api } from '../../lib/api.js';
import { fmt, nowIn } from '../../lib/dates.js';
import { money } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';

const EMPTY_PATIENT = {
  name: '',
  phone: '',
  email: '',
  birthDate: '',
  gender: '',
  idNumber: '',
  address: '',
  companyId: '',
  medical: '',
  notes: '',
  source: '',
  consent: true,
};

/** Create or edit a patient file. */
export function PatientFormModal({ biz, patient, onClose, onSaved }) {
  const { t, tErr } = useI18n();
  const [d, setD] = useState(() => ({ ...EMPTY_PATIENT, ...(patient ?? {}), companyId: patient?.companyId ?? '' }));
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/businesses/${biz.id}/companies`)
      .then(setCompanies)
      .catch(() => {});
  }, [biz.id]);
  const set = (k) => (e) => setD({ ...d, [k]: e?.target ? e.target.value : e });

  // Romanian personal code (CNP) holds the birth date and sex: fill them in when empty
  const fromCnp = (v) => {
    const m = /^([1-8])(\d{2})(\d{2})(\d{2})\d{6}$/.exec(v.trim());
    if (!m) return {};
    const century = { 1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000, 7: 1900, 8: 1900 }[m[1]];
    const out = {};
    if (!d.birthDate) out.birthDate = `${century + Number(m[2])}-${m[3]}-${m[4]}`;
    if (!d.gender) out.gender = Number(m[1]) % 2 ? 'm' : 'f';
    return out;
  };

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    const body = { ...d, companyId: d.companyId ? Number(d.companyId) : null };
    try {
      const saved = patient
        ? await api(`/businesses/${biz.id}/patients/${patient.id}`, { method: 'PATCH', body })
        : await api(`/businesses/${biz.id}/patients`, { method: 'POST', body });
      onSaved(saved);
    } catch (err) {
      setError(tErr(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={patient ? t('pat.editTitle') : t('pat.newTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !d.name.trim()}>
            {t('settings.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('pat.name')} className="sm:col-span-2">
            <input className="input" required autoFocus value={d.name} onChange={set('name')} maxLength={120} />
          </Field>
          <Field label={t('appt.phone')}>
            <input className="input" type="tel" value={d.phone} onChange={set('phone')} maxLength={40} />
          </Field>
          <Field label={t('appt.email')} optional>
            <input className="input" type="email" value={d.email} onChange={set('email')} maxLength={160} />
          </Field>
          <Field label={t('pat.idNumber')} optional hint={t('pat.idHint')}>
            <input
              className="input"
              value={d.idNumber}
              maxLength={20}
              onChange={(e) => setD({ ...d, idNumber: e.target.value, ...fromCnp(e.target.value) })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('pat.birthDate')} optional>
              <input className="input" type="date" value={d.birthDate} onChange={set('birthDate')} />
            </Field>
            <Field label={t('pat.gender')} optional>
              <select className="input" value={d.gender} onChange={set('gender')}>
                <option value="">—</option>
                <option value="f">{t('pat.genderF')}</option>
                <option value="m">{t('pat.genderM')}</option>
              </select>
            </Field>
          </div>
          <Field label={t('pat.company')} optional>
            <select className="input" value={d.companyId} onChange={set('companyId')}>
              <option value="">{t('pat.noCompany')}</option>
              {companies
                .filter((c) => c.active || c.id === d.companyId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.discount ? ` (-${c.discount}%)` : ''}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t('pat.source')} optional>
            <input className="input" list="pat-sources" value={d.source} onChange={set('source')} maxLength={80} />
            <datalist id="pat-sources">
              {['recommendation', 'google', 'facebook', 'instagram', 'website', 'walkIn'].map((k) => (
                <option key={k} value={t(`pat.sources.${k}`)} />
              ))}
            </datalist>
          </Field>
          <Field label={t('pat.address')} optional className="sm:col-span-2">
            <input className="input" value={d.address} onChange={set('address')} maxLength={300} />
          </Field>
          <Field label={t('pat.medical')} optional hint={t('pat.medicalHint')} className="sm:col-span-2">
            <textarea className="input min-h-[70px]" value={d.medical} onChange={set('medical')} maxLength={2000} />
          </Field>
          <Field label={t('pat.notes')} optional className="sm:col-span-2">
            <textarea className="input min-h-[70px]" value={d.notes} onChange={set('notes')} maxLength={4000} />
          </Field>
        </div>
        <Toggle checked={d.consent} onChange={(v) => setD({ ...d, consent: v })} label={t('pat.consent')} description={t('pat.consentHint')} />
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

const METHODS = [
  ['cash', Cash],
  ['card', Card],
  ['transfer', Send],
  ['other', Message],
];

/**
 * Take a payment. `appointments` (optional) lets the user tie it to a visit;
 * `appointment` preselects one and suggests what is left to pay.
 */
export function PaymentModal({ biz, patient, appointments = [], appointment, onClose, onSaved }) {
  const { t, tErr, locale } = useI18n();
  const toast = useToast();
  const left = (a) => Math.max(0, Math.round(((a?.price ?? 0) - (a?.paid ?? 0)) * 100) / 100);
  const [d, setD] = useState(() => ({
    appointmentId: appointment?.id ?? '',
    amount: appointment ? String(left(appointment) || '') : '',
    method: 'cash',
    note: '',
    paidAt: nowIn(biz.settings.timezone),
    complete: !!appointment && ['confirmed', 'pending'].includes(appointment.status),
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => appointments.filter((a) => a.status !== 'cancelled' && a.price > 0), [appointments]);
  const picked = options.find((a) => a.id === Number(d.appointmentId)) ?? appointment;
  // refunds and other days are the owner's (the server enforces the same)
  const owner = biz.me?.role === 'owner';

  const pick = (id) => {
    const a = options.find((x) => x.id === Number(id));
    setD({ ...d, appointmentId: id, amount: a ? String(left(a) || '') : d.amount, complete: !!a && ['confirmed', 'pending'].includes(a.status) });
  };

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = await api(`/businesses/${biz.id}/payments`, {
        method: 'POST',
        body: {
          patientId: patient?.id,
          appointmentId: d.appointmentId ? Number(d.appointmentId) : null,
          amount: Number(String(d.amount).replace(',', '.')),
          method: d.method,
          note: d.note,
          paidAt: d.paidAt,
          complete: d.complete,
        },
      });
      toast(t('pay.saved'));
      onSaved(saved);
    } catch (err) {
      setError(tErr(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={patient?.name}
      title={t('pay.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !Number(String(d.amount).replace(',', '.'))}>
            {t('pay.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        {options.length > 0 && (
          <Field label={t('pay.forVisit')} optional>
            <select className="input" value={d.appointmentId} onChange={(e) => pick(e.target.value)}>
              <option value="">{t('pay.noVisit')}</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {fmt.full(a.start, locale)} · {a.serviceName || a.calendarName} · {money(a.price, biz.settings.currency, locale)}
                  {a.paid > 0 ? ` (${t('pay.paidSoFar', { v: money(a.paid, '', locale) })})` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {picked && (
          <div className="rounded-[12px] bg-white/[0.04] px-3 py-2 text-[12px] text-paper/65">
            {t('pay.visitLine', {
              price: money(picked.price ?? 0, biz.settings.currency, locale),
              paid: money(picked.paid ?? 0, biz.settings.currency, locale),
              left: money(left(picked), biz.settings.currency, locale),
            })}
          </div>
        )}
        <Field label={`${t('pay.amount')} (${biz.settings.currency})`} hint={owner ? t('pay.amountHint') : undefined}>
          <input className="input text-[18px] font-semibold" inputMode="decimal" autoFocus value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} />
        </Field>
        <Field label={t('pay.method')}>
          <Segmented
            value={d.method}
            onChange={(v) => setD({ ...d, method: v })}
            options={METHODS.map(([k, Icon]) => ({ value: k, label: t(`pay.methods.${k}`), icon: <Icon width={14} height={14} /> }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('pay.when')} hint={owner ? undefined : t('pay.dateOwnerOnly')}>
            <input className="input disabled:opacity-60" type="datetime-local" disabled={!owner} value={d.paidAt} onChange={(e) => setD({ ...d, paidAt: e.target.value })} />
          </Field>
          <Field label={t('pay.note')} optional>
            <input className="input" value={d.note} maxLength={300} onChange={(e) => setD({ ...d, note: e.target.value })} />
          </Field>
        </div>
        {picked && ['confirmed', 'pending'].includes(picked.status) && (
          <Toggle checked={d.complete} onChange={(v) => setD({ ...d, complete: v })} label={t('pay.markDone')} />
        )}
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/** Same rule as the server: 07xx… → 407xx…, +/00 prefixes kept as they are. */
export function intlPhone(phone, cc = '40') {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (String(phone).trim().startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return cc + d.slice(1);
  return d;
}
const linkFor = (channel, phone, body, cc) => {
  const to = intlPhone(phone, cc);
  const text = encodeURIComponent(body);
  return channel === 'whatsapp' ? `https://wa.me/${to}?text=${text}` : `sms:+${to}?&body=${text}`;
};

/**
 * Write a WhatsApp / SMS message from a template. "Open WhatsApp / SMS" uses the phone's own app
 * (free); "Send now" goes through the business's SMS provider when one is set up.
 */
export function MessageModal({ biz, patient, appointment, kind: initialKind = 'reminder', onClose, onSent }) {
  const { t, tErr, lang } = useI18n();
  const toast = useToast();
  const cc = biz.settings.messaging?.countryCode || '40';
  const [channel, setChannel] = useState(biz.settings.messaging?.channel === 'sms' ? 'sms' : 'whatsapp');
  const [kind, setKind] = useState(appointment ? initialKind : 'custom');
  const [msgLang, setMsgLang] = useState(lang);
  const [phone, setPhone] = useState(appointment?.clientPhone || patient?.phone || '');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const target = appointment ? { appointmentId: appointment.id } : { patientId: patient?.id };

  // fill the text from the template whenever the type or language changes
  useEffect(() => {
    let alive = true;
    api(`/businesses/${biz.id}/messages/preview`, { method: 'POST', body: { ...target, kind, channel, lang: msgLang, phone: phone || undefined } })
      .then((r) => alive && setBody(r.body))
      .catch((e) => alive && setError(tErr(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, msgLang]);

  const payload = (mode) => ({ ...target, kind, channel, lang: msgLang, phone, body, mode });
  const link = phone && body ? linkFor(channel, phone, body, cc) : '';

  // the browser opens the app straight from the click (no popup blocker); the log is written alongside
  const logManual = () => {
    api(`/businesses/${biz.id}/messages`, { method: 'POST', body: payload('manual') })
      .then((m) => onSent?.(m))
      .catch(() => {});
  };
  const sendAuto = async () => {
    setBusy(true);
    setError('');
    try {
      const m = await api(`/businesses/${biz.id}/messages`, { method: 'POST', body: payload('auto') });
      toast(t('msg.sent'));
      onSent?.(m);
      onClose();
    } catch (err) {
      setError(tErr(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={patient?.name || appointment?.clientName}
      title={t('msg.composeTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={sendAuto} disabled={busy || !phone || !body.trim()} title={t('msg.sendAutoHint')}>
            <Send width={14} height={14} /> {t('msg.sendAuto')}
          </Button>
          <a
            href={link || undefined}
            target={channel === 'whatsapp' ? '_blank' : undefined}
            rel="noreferrer"
            aria-disabled={!link}
            onClick={(e) => {
              if (!link) return e.preventDefault();
              logManual();
              setTimeout(onClose, 300);
            }}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-5 text-ui font-semibold text-[#fff] ${link ? (channel === 'whatsapp' ? 'bg-[#25a35a] hover:bg-[#1f8c4d]' : 'bg-gold hover:opacity-90') : 'pointer-events-none bg-gold/40'}`}
          >
            {channel === 'whatsapp' ? <Whatsapp width={16} height={16} /> : <Message width={16} height={16} />}
            {channel === 'whatsapp' ? t('msg.openWhatsapp') : t('msg.openSms')}
          </a>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Segmented
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'whatsapp', label: 'WhatsApp', icon: <Whatsapp width={14} height={14} /> },
              { value: 'sms', label: 'SMS', icon: <Message width={14} height={14} /> },
            ]}
          />
          <Segmented value={msgLang} onChange={setMsgLang} options={[{ value: 'ro', label: 'RO' }, { value: 'en', label: 'EN' }]} />
        </div>
        <Field label={t('msg.kind')}>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {(appointment ? ['reminder', 'confirmation', 'custom'] : ['custom']).map((k) => (
              <option key={k} value={k}>
                {t(`msg.kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('appt.phone')}>
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t('msg.text')} hint={t('msg.chars', { n: body.length, parts: Math.max(1, Math.ceil(body.length / 153)) })}>
          <textarea className="input min-h-[130px]" value={body} maxLength={1600} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {patient && patient.consent === false && <ErrorNote>{t('msg.noConsent')}</ErrorNote>}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
