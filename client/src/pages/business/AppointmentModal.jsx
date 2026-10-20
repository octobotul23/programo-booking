import { useEffect, useMemo, useState } from 'react';
import { Button, ErrorNote, Field, Modal, StatusBadge, TimeInput, cx } from '../../components/ui.jsx';
import { Check, Clock, Close, Folder, Trash } from '../../components/icons.jsx';
import { api, qs } from '../../lib/api.js';
import { diffMinutes } from '../../lib/dates.js';
import { useI18n } from '../../lib/i18n.jsx';
import { CustomFieldInput } from '../../components/CustomFields.jsx';
import { money } from '../../lib/format.js';

const STATUSES = ['confirmed', 'pending', 'completed', 'no_show', 'cancelled'];

/**
 * Create or edit an appointment.
 * `appointment` = existing record, or `preset` = { calendarId, date, time, patientId, clientName… } for a new one.
 */
export default function AppointmentModal({ biz, appointment, preset, onClose, onSaved }) {
  const { t, tErr, locale } = useI18n();
  const isNew = !appointment;
  const activeCalendars = biz.calendars.filter((c) => c.active || c.id === appointment?.calendarId);

  const [form, setForm] = useState(() => {
    if (appointment)
      return {
        calendarId: appointment.calendarId,
        serviceId: appointment.serviceId ?? '',
        date: appointment.start.slice(0, 10),
        time: appointment.start.slice(11, 16),
        duration: diffMinutes(appointment.start, appointment.end),
        clientName: appointment.clientName,
        clientPhone: appointment.clientPhone,
        clientEmail: appointment.clientEmail,
        notes: appointment.notes,
        status: appointment.status,
        custom: appointment.custom ?? {},
        patientId: appointment.patientId ?? null,
        price: appointment.price ?? '',
      };
    const calendarId = preset?.calendarId ?? activeCalendars[0]?.id;
    const cal = biz.calendars.find((c) => c.id === calendarId);
    const svc = biz.services.find((x) => x.id === preset?.serviceId);
    return {
      calendarId,
      serviceId: svc?.id ?? '',
      date: preset?.date,
      time: preset?.time ?? '09:00',
      duration: svc?.duration || cal?.defaultDuration || biz.settings.defaultDuration,
      clientName: preset?.clientName ?? '',
      clientPhone: preset?.clientPhone ?? '',
      clientEmail: preset?.clientEmail ?? '',
      notes: '',
      status: 'confirmed',
      custom: {},
      patientId: preset?.patientId ?? null,
      price: '',
    };
  });
  // the price goes to the server only when typed here; otherwise it follows the service (less any company discount)
  const [priceTouched, setPriceTouched] = useState(false);
  const [linkedName, setLinkedName] = useState(() => (form.patientId ? form.clientName : ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const calendar = biz.calendars.find((c) => c.id === Number(form.calendarId));
  const services = useMemo(
    () => biz.services.filter((s) => (s.active || s.id === appointment?.serviceId) && (!s.calendarIds.length || s.calendarIds.includes(Number(form.calendarId)))),
    [biz.services, form.calendarId, appointment?.serviceId],
  );

  // free-slot helper for the chosen calendar + day
  useEffect(() => {
    if (!form.calendarId || !form.date) return;
    let alive = true;
    setSlots(null);
    api(`/businesses/${biz.id}/availability${qs({ calendarId: form.calendarId, date: form.date, serviceId: form.serviceId })}`)
      .then((s) => alive && setSlots(s))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [biz.id, form.calendarId, form.date, form.serviceId]);

  const pickService = (id) => {
    const s = biz.services.find((x) => x.id === Number(id));
    set({ serviceId: id, duration: s?.duration ?? (calendar?.defaultDuration || biz.settings.defaultDuration) });
  };

  const save = async (extra = {}, force = false) => {
    setBusy(true);
    setError('');
    const { patientId, price, ...rest } = form;
    const body = {
      ...rest,
      ...(patientId !== (appointment?.patientId ?? null) || (isNew && patientId) ? { patientId } : {}),
      ...(priceTouched ? { price: price === '' ? '' : Number(price) } : {}),
      calendarId: Number(form.calendarId),
      serviceId: form.serviceId ? Number(form.serviceId) : null,
      duration: Number(form.duration),
      ...extra,
      force,
    };
    try {
      const saved = isNew
        ? await api(`/businesses/${biz.id}/appointments`, { method: 'POST', body })
        : await api(`/businesses/${biz.id}/appointments/${appointment.id}`, { method: 'PATCH', body });
      onSaved(saved);
    } catch (err) {
      if (err.code === 'conflict' && !force) {
        setBusy(false);
        if (window.confirm(err.data?.timeOff ? t('appt.conflictOff') : t('appt.conflictFull'))) return save(extra, true);
        return;
      }
      setError(tErr(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('appt.deleteConfirm'))) return;
    setBusy(true);
    try {
      await api(`/businesses/${biz.id}/appointments/${appointment.id}`, { method: 'DELETE' });
      onSaved(null);
    } catch (err) {
      setError(tErr(err));
      setBusy(false);
    }
  };

  const quick = (status) => save({ status });

  return (
    <Modal
      open
      wide
      onClose={onClose}
      eyebrow={isNew ? calendar?.name : t(`appt.source.${appointment.source}`)}
      title={isNew ? t('appt.titleNew') : appointment.clientName}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" size="sm" onClick={remove} disabled={busy} className="mr-auto">
              <Trash width={14} height={14} /> {t('appt.delete')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => save()} disabled={busy || !form.clientName.trim()}>
            {isNew ? t('appt.create') : t('appt.save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-5"
      >
        {!isNew && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={appointment.status} />
            {appointment.status === 'pending' && (
              <Button size="sm" variant="gold" onClick={() => quick('confirmed')} disabled={busy}>
                <Check width={14} height={14} /> {t('appt.confirm')}
              </Button>
            )}
            {['pending', 'confirmed'].includes(appointment.status) && (
              <>
                <Button size="sm" variant="outline" onClick={() => quick('completed')} disabled={busy}>
                  {t('appt.markCompleted')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => quick('no_show')} disabled={busy}>
                  {t('appt.markNoShow')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => quick('cancelled')} disabled={busy}>
                  {t('appt.cancelAppt')}
                </Button>
              </>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('appt.calendar')}>
            <select className="input" value={form.calendarId} onChange={(e) => set({ calendarId: Number(e.target.value) })}>
              {activeCalendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('appt.service')}>
            <select className="input" value={form.serviceId} onChange={(e) => pickService(e.target.value)}>
              <option value="">{t('appt.noService')}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration} {t('appt.min')}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label={t('appt.date')} className="col-span-2 sm:col-span-1">
            <input className="input" type="date" required value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label={t('appt.time')}>
            <TimeInput required value={form.time} onChange={(v) => set({ time: v })} />
          </Field>
          <Field label={t('appt.duration')}>
            <input className="input" type="number" min={5} max={1440} step={5} required value={form.duration} onChange={(e) => set({ duration: e.target.value })} />
          </Field>
        </div>

        {/* quick pick from the free slots of that day */}
        <div>
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-paper/55">
            <Clock width={14} height={14} /> {t('appt.freeSlots')}
          </div>
          {slots === null ? (
            <div className="h-8" />
          ) : slots.length === 0 ? (
            <div className="text-[12px] text-paper/40">{t('appt.noSlots')}</div>
          ) : (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
              {slots.map((s) => (
                <button
                  key={s.time}
                  type="button"
                  onClick={() => set({ time: s.time })}
                  className={cx(
                    'h-8 shrink-0 rounded-full border px-3 text-[12px] font-medium tabular-nums transition-colors',
                    form.time === s.time ? 'border-gold bg-gold text-ink' : 'border-white/14 text-paper/80 hover:border-white/40',
                  )}
                >
                  {s.time}
                  {calendar?.capacity > 1 && <span className="ml-1 opacity-60">·{s.spots}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <PatientPicker
            biz={biz}
            className="sm:col-span-3"
            label={t('appt.client')}
            autoFocus={isNew}
            value={form.clientName}
            linked={form.patientId ? linkedName || form.clientName : ''}
            onChange={(v) => set({ clientName: v })}
            onPick={(p) => {
              setLinkedName(p.name);
              set({ patientId: p.id, clientName: p.name, clientPhone: p.phone || form.clientPhone, clientEmail: p.email || form.clientEmail });
            }}
            onUnlink={() => set({ patientId: null })}
          />
          <Field label={t('appt.phone')} className="sm:col-span-1">
            <input className="input" type="tel" value={form.clientPhone} onChange={(e) => set({ clientPhone: e.target.value })} />
          </Field>
          <Field label={t('appt.email')} className="sm:col-span-2">
            <input className="input" type="email" value={form.clientEmail} onChange={(e) => set({ clientEmail: e.target.value })} />
          </Field>
        </div>

        {biz.settings.customFields.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {biz.settings.customFields.map((f) => (
              <CustomFieldInput key={f.id} field={f} value={form.custom[f.id]} onChange={(v) => set({ custom: { ...form.custom, [f.id]: v } })} />
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={`${t('appt.price')} (${biz.settings.currency})`}
            hint={!priceTouched && (isNew || form.serviceId !== (appointment?.serviceId ?? '')) ? t('appt.priceAuto') : null}
          >
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder={(() => {
                const svc = biz.services.find((x) => x.id === Number(form.serviceId));
                return svc?.price != null ? money(svc.price, '', locale) : '—';
              })()}
              value={form.price ?? ''}
              onChange={(e) => {
                setPriceTouched(true);
                set({ price: e.target.value });
              }}
            />
          </Field>
        </div>

        <Field label={t('appt.notes')}>
          <textarea className="input" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>

        {!isNew && (
          <Field label={t('appt.status')}>
            <select className="input" value={form.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </Field>
        )}

        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/** Client name field that suggests existing patient files as you type. */
function PatientPicker({ biz, label, value, linked, onChange, onPick, onUnlink, autoFocus, className }) {
  const { t } = useI18n();
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const q = value.trim();
    if (linked || q.length < 2) return setHits([]);
    let alive = true;
    const id = setTimeout(() => {
      api(`/businesses/${biz.id}/patients${qs({ q, limit: 6 })}`)
        .then((rows) => alive && setHits(rows))
        .catch(() => {});
    }, 200);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [biz.id, value, linked]);

  return (
    <Field label={label} className={className}>
      <div className="relative">
        <input
          className="input"
          required
          autoFocus={autoFocus}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && hits.length > 0 && (
          <ul className="glass-strong absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-[12px] p-1 shadow-xl">
            {hits.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-left hover:bg-white/8"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ui font-medium">{p.name}</span>
                    <span className="block truncate text-[11px] text-paper/50">{[p.phone, p.email, p.companyName].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-paper/45">{t('pat.visitsN', { n: p.visits })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {linked ? (
        <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-gold/12 py-1 pr-1 pl-2.5 text-[11px] font-medium text-gold-light">
          <Folder width={13} height={13} /> {t('appt.linkedTo', { name: linked })}
          <button type="button" onClick={onUnlink} className="grid size-5 place-items-center rounded-full hover:bg-gold/20" aria-label={t('appt.unlink')}>
            <Close width={11} height={11} />
          </button>
        </span>
      ) : (
        <span className="text-[11px] leading-4 text-paper/40">{t('appt.pickHint')}</span>
      )}
    </Field>
  );
}
