import { useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Avatar, DataTable, Dot, Page, Panel, Td, useApi } from '../../components/clinic.jsx';
import { Button, Empty, ErrorNote, Field, LoadLine, Modal, StatusBadge, cx } from '../../components/ui.jsx';
import { Building, Calendar, ChevronLeft, Edit, Folder, Info, Mail, Message, Phone, Plus, Trash, Users, Wallet, Whatsapp } from '../../components/icons.jsx';
import { api, qs } from '../../lib/api.js';
import { fmt, nowIn } from '../../lib/dates.js';
import { age, money } from '../../lib/format.js';
import { useAuth } from '../../lib/auth.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';
import AppointmentModal from './AppointmentModal.jsx';
import { MessageModal, PatientFormModal, PaymentModal } from './clinicModals.jsx';

const KINDS = ['note', 'diagnosis', 'treatment', 'prescription', 'recommendation'];
const KIND_TONE = { note: '#7b8a90', diagnosis: '#d0583a', treatment: '#2f7fc1', prescription: '#6b5fd6', recommendation: '#1f9d63' };
const TABS = ['file', 'visits', 'payments', 'messages', 'details'];

export default function PatientPage() {
  const { pid } = useParams();
  const { biz, labels, desk, version } = useOutletContext();
  const { t, tErr, locale } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, error, reload } = useApi(`/businesses/${biz.id}/patients/${pid}`, [version]);
  const [tab, setTab] = useState('file');
  const [modal, setModal] = useState(null);
  const isOwner = biz.me.role === 'owner';
  const cur = biz.settings.currency;
  const m = (v) => money(v, cur, locale);
  const today = nowIn(biz.settings.timezone).slice(0, 10);

  if (error)
    return (
      <Page>
        <ErrorNote>{error}</ErrorNote>
        <Button className="mt-4" onClick={() => navigate('..', { relative: 'path' })}>
          {t('common.back')}
        </Button>
      </Page>
    );
  if (!data) return <Page>{<LoadLine />}</Page>;

  const { patient: p, company, appointments, records, payments, messages, totals } = data;
  const years = age(p.birthDate, today);
  const next = [...appointments].reverse().find((a) => a.start >= `${today}T00:00` && ['confirmed', 'pending'].includes(a.status));
  const close = () => setModal(null);
  const done = () => {
    setModal(null);
    reload();
  };

  const remove = async () => {
    if (!window.confirm(t('pat.deleteConfirm', { name: p.name }))) return;
    try {
      await api(`/businesses/${biz.id}/patients/${p.id}`, { method: 'DELETE' });
      toast(t('pat.deleted'));
      navigate('..', { relative: 'path' });
    } catch (e) {
      toast(tErr(e));
    }
  };

  return (
    <Page className="max-w-[1200px]">
      <Link to=".." relative="path" className="inline-flex items-center gap-1 text-[13px] text-paper/60 hover:text-paper">
        <ChevronLeft width={16} height={16} /> {labels.clients}
      </Link>

      {/* header card */}
      <section className="card mt-3 p-4 md:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={p.name} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[clamp(20px,2.4vw,28px)] leading-tight font-semibold tracking-[-0.02em]">{p.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-paper/65">
              {years !== null && (
                <span>
                  {t('pat.yearsN', { n: years })}
                  {p.gender ? ` · ${t(p.gender === 'f' ? 'pat.genderF' : 'pat.genderM')}` : ''}
                </span>
              )}
              {p.phone && (
                <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1.5 hover:text-paper">
                  <Phone width={14} height={14} /> {p.phone}
                </a>
              )}
              {p.email && (
                <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 hover:text-paper">
                  <Mail width={14} height={14} /> {p.email}
                </a>
              )}
              {company && (
                <span className="inline-flex items-center gap-1.5">
                  <Building width={14} height={14} /> {company.name}
                  {company.discount ? ` (-${company.discount}%)` : ''}
                </span>
              )}
            </div>
            {p.medical && (
              <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[13px] text-danger">
                <Info width={16} height={16} className="mt-0.5 shrink-0" />
                <span className="whitespace-pre-line">{p.medical}</span>
              </div>
            )}
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button variant="gold" size="sm" onClick={() => setModal({ type: 'book' })}>
              <Calendar width={14} height={14} /> {t('pat.book')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModal({ type: 'message' })} disabled={!p.phone}>
              <Whatsapp width={14} height={14} /> {t('pat.sendMessage')}
            </Button>
            {(desk || appointments.length > 0) && (
              <Button variant="outline" size="sm" onClick={() => setModal({ type: 'pay' })}>
                <Wallet width={14} height={14} /> {t('pat.takePayment')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setModal({ type: 'edit' })}>
              <Edit width={14} height={14} /> {t('common.edit')}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/8 pt-4 sm:grid-cols-4">
          <Fact label={t('pat.visits')} value={appointments.filter((a) => a.status !== 'cancelled').length} />
          <Fact label={t('pat.nextVisit')} value={next ? `${fmt.short(next.start.slice(0, 10), locale)}, ${fmt.time(next.start)}` : '—'} />
          {totals ? (
            <>
              <Fact label={t('pat.charged')} value={m(totals.charged)} />
              <Fact
                label={totals.balance >= 0 ? t('pat.owes') : t('pat.credit')}
                value={m(Math.abs(totals.balance))}
                className={totals.balance > 0 ? 'text-danger' : totals.balance < 0 ? 'text-ready' : ''}
              />
            </>
          ) : (
            <Fact label={t('pat.fileEntries')} value={records.length} />
          )}
        </div>
      </section>

      {/* tabs */}
      <div className="no-scrollbar mt-4 flex gap-1 overflow-x-auto border-b border-white/10">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cx(
              '-mb-px shrink-0 border-b-2 px-4 py-2.5 text-ui font-medium whitespace-nowrap transition-colors',
              tab === k ? 'border-gold text-gold-light' : 'border-transparent text-paper/60 hover:text-paper',
            )}
          >
            {t(`pat.tabs.${k}`)}
            <span className="ml-1.5 text-[11px] opacity-60">
              {k === 'file' ? records.length : k === 'visits' ? appointments.length : k === 'payments' ? payments.length : k === 'messages' ? messages.length : ''}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'file' && <FileTab biz={biz} patient={p} records={records} appointments={appointments} onChange={reload} isOwner={isOwner} />}
        {tab === 'visits' && (
          <VisitsTab
            biz={biz}
            appointments={appointments}
            m={m}
            canPay={desk}
            onPay={(a) => setModal({ type: 'pay', appointment: a })}
            onMessage={(a) => setModal({ type: 'message', appointment: a })}
          />
        )}
        {tab === 'payments' && <PaymentsTab biz={biz} payments={payments} totals={totals} m={m} isOwner={isOwner} onChange={reload} />}
        {tab === 'messages' && <MessagesTab messages={messages} />}
        {tab === 'details' && (
          <DetailsTab
            p={p}
            company={company}
            isOwner={isOwner}
            desk={desk}
            onEdit={() => setModal({ type: 'edit' })}
            onDelete={remove}
            onMerge={() => setModal({ type: 'merge' })}
          />
        )}
      </div>

      {modal?.type === 'edit' && <PatientFormModal biz={biz} patient={p} onClose={close} onSaved={done} />}
      {modal?.type === 'book' && (
        <AppointmentModal
          biz={biz}
          preset={{ date: today, patientId: p.id, clientName: p.name, clientPhone: p.phone, clientEmail: p.email }}
          onClose={close}
          onSaved={done}
        />
      )}
      {modal?.type === 'pay' && <PaymentModal biz={biz} patient={p} appointments={appointments} appointment={modal.appointment} onClose={close} onSaved={done} />}
      {modal?.type === 'message' && <MessageModal biz={biz} patient={p} appointment={modal.appointment ?? next} onClose={close} onSent={reload} />}
      {modal?.type === 'merge' && <MergeModal biz={biz} patient={p} onClose={close} onDone={done} />}
    </Page>
  );
}

function Fact({ label, value, className }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium tracking-wide text-paper/45 uppercase">{label}</div>
      <div className={cx('mt-1 truncate text-[16px] font-semibold tabular-nums', className)}>{value}</div>
    </div>
  );
}

/* ───────── Dosar: notes, diagnoses, treatments, prescriptions ───────── */

function FileTab({ biz, patient, records, appointments, onChange, isOwner }) {
  const { t, tErr, locale } = useI18n();
  const { user } = useAuth();
  const blank = { kind: 'note', title: '', body: '', appointmentId: '' };
  const [d, setD] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const visits = appointments.filter((a) => a.status !== 'cancelled');
  const shown = filter ? records.filter((r) => r.kind === filter) : records;
  const apptById = useMemo(() => new Map(appointments.map((a) => [a.id, a])), [appointments]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (editing) await api(`/businesses/${biz.id}/records/${editing}`, { method: 'PATCH', body: d });
      else await api(`/businesses/${biz.id}/patients/${patient.id}/records`, { method: 'POST', body: { ...d, appointmentId: d.appointmentId ? Number(d.appointmentId) : null } });
      setD(blank);
      setEditing(null);
      onChange();
    } catch (e) {
      setError(tErr(e));
    }
    setBusy(false);
  };
  const remove = async (r) => {
    if (!window.confirm(t('rec.deleteConfirm'))) return;
    try {
      await api(`/businesses/${biz.id}/records/${r.id}`, { method: 'DELETE' });
      onChange();
    } catch (e) {
      setError(tErr(e));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Panel title={editing ? t('rec.editTitle') : t('rec.addTitle')} className="h-fit">
        <div className="flex flex-col gap-3">
          <Field label={t('rec.kind')}>
            <select className="input" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`rec.kinds.${k}`)}
                </option>
              ))}
            </select>
          </Field>
          {!editing && visits.length > 0 && (
            <Field label={t('rec.visit')} optional>
              <select className="input" value={d.appointmentId} onChange={(e) => setD({ ...d, appointmentId: e.target.value })}>
                <option value="">—</option>
                {visits.slice(0, 30).map((a) => (
                  <option key={a.id} value={a.id}>
                    {fmt.full(a.start, locale)} · {a.calendarName}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={t('rec.titleField')} optional>
            <input className="input" value={d.title} maxLength={200} onChange={(e) => setD({ ...d, title: e.target.value })} />
          </Field>
          <Field label={t('rec.body')}>
            <textarea className="input min-h-[140px]" value={d.body} maxLength={20000} onChange={(e) => setD({ ...d, body: e.target.value })} />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex justify-end gap-2">
            {editing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setD(blank);
                }}
              >
                {t('common.cancel')}
              </Button>
            )}
            <Button variant="gold" size="sm" onClick={save} disabled={busy || !(d.title.trim() || d.body.trim())}>
              {editing ? t('settings.save') : (
                <>
                  <Plus width={14} height={14} /> {t('rec.add')}
                </>
              )}
            </Button>
          </div>
        </div>
      </Panel>

      <div className="min-w-0">
        <div className="no-scrollbar mb-3 flex gap-1 overflow-x-auto">
          {['', ...KINDS].map((k) => (
            <button
              key={k || 'all'}
              type="button"
              onClick={() => setFilter(k)}
              className={cx('shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium', filter === k ? 'bg-gold text-white' : 'text-paper/65 hover:bg-white/8')}
            >
              {k ? t(`rec.kinds.${k}`) : t('rec.all')}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <Empty icon={Folder}>{t('rec.empty')}</Empty>
        ) : (
          <ol className="relative flex flex-col gap-3 border-l border-white/10 pl-5">
            {shown.map((r) => {
              const a = r.appointmentId && apptById.get(r.appointmentId);
              const mine = r.authorId === user.id || isOwner;
              return (
                <li key={r.id} className="relative">
                  <span className="absolute top-4 -left-[26px] size-3 rounded-full ring-4 ring-ink" style={{ background: KIND_TONE[r.kind] }} />
                  <article className="card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#fff]" style={{ background: KIND_TONE[r.kind] }}>
                        {t(`rec.kinds.${r.kind}`)}
                      </span>
                      {r.title && <h3 className="text-[14px] font-semibold">{r.title}</h3>}
                      <span className="ml-auto text-[11px] text-paper/45">
                        {fmt.full(r.createdAt, locale)} · {r.authorName}
                      </span>
                    </div>
                    {r.body && <p className="mt-2 text-ui leading-6 whitespace-pre-line text-paper/85">{r.body}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      {a && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-paper/50">
                          <Dot color={a.calendarColor} /> {fmt.short(a.start.slice(0, 10), locale)} · {a.calendarName}
                          {a.serviceName ? ` · ${a.serviceName}` : ''}
                        </span>
                      )}
                      {mine && (
                        <span className="ml-auto flex gap-1">
                          <button
                            type="button"
                            className="grid size-7 place-items-center rounded-full text-paper/50 hover:bg-white/8 hover:text-paper"
                            onClick={() => {
                              setEditing(r.id);
                              setD({ kind: r.kind, title: r.title, body: r.body, appointmentId: '' });
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            aria-label={t('common.edit')}
                          >
                            <Edit width={14} height={14} />
                          </button>
                          <button type="button" className="grid size-7 place-items-center rounded-full text-paper/50 hover:bg-white/8 hover:text-danger" onClick={() => remove(r)} aria-label={t('common.delete')}>
                            <Trash width={14} height={14} />
                          </button>
                        </span>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function VisitsTab({ biz, appointments, m, canPay, onPay, onMessage }) {
  const { t, locale } = useI18n();
  if (!appointments.length) return <Empty icon={Calendar}>{t('pat.noVisits')}</Empty>;
  return (
    <div className="card">
      <DataTable
        head={[t('appt.date'), t('appt.calendar'), t('appt.service'), t('appt.status'), { label: t('appt.price'), right: true }, { label: t('pat.paid'), right: true }, '']}
      >
        {appointments.map((a) => {
          const left = (a.price ?? 0) - (a.paid ?? 0);
          return (
            <tr key={a.id} className="hover:bg-white/[0.03]">
              <Td className="whitespace-nowrap">
                <Link to={`/app/${biz.id}/calendar?date=${a.start.slice(0, 10)}&open=${a.id}`} className="font-medium hover:underline">
                  {fmt.full(a.start, locale)}
                </Link>
              </Td>
              <Td>
                <span className="inline-flex items-center gap-2">
                  <Dot color={a.calendarColor} /> {a.calendarName}
                </span>
              </Td>
              <Td className="text-paper/70">{a.serviceName || '—'}</Td>
              <Td>
                <StatusBadge status={a.status} />
              </Td>
              <Td right>{a.price != null ? m(a.price) : '—'}</Td>
              <Td right className={left > 0.001 && a.status === 'completed' ? 'text-danger' : ''}>
                {a.paid ? m(a.paid) : '—'}
              </Td>
              <Td right className="whitespace-nowrap">
                {['confirmed', 'pending'].includes(a.status) && (
                  <button type="button" onClick={() => onMessage(a)} className="mr-1 rounded-full px-2 py-1 text-[12px] font-medium text-gold-light hover:bg-white/8">
                    {t('pat.remind')}
                  </button>
                )}
                {canPay && a.price > 0 && left > 0.001 && !['cancelled', 'no_show'].includes(a.status) && (
                  <button type="button" onClick={() => onPay(a)} className="rounded-full bg-gold/15 px-2.5 py-1 text-[12px] font-semibold text-gold-light hover:bg-gold/25">
                    {t('pat.pay')}
                  </button>
                )}
              </Td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}

function PaymentsTab({ biz, payments, totals, m, isOwner, onChange }) {
  const { t, tErr, locale } = useI18n();
  const toast = useToast();
  const remove = async (p) => {
    if (!window.confirm(t('pay.deleteConfirm'))) return;
    try {
      await api(`/businesses/${biz.id}/payments/${p.id}`, { method: 'DELETE' });
      onChange();
    } catch (e) {
      toast(tErr(e));
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {totals && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3">
            <div className="text-[11px] text-paper/50 uppercase">{t('pat.charged')}</div>
            <div className="mt-1 text-[18px] font-semibold tabular-nums">{m(totals.charged)}</div>
          </div>
          <div className="card p-3">
            <div className="text-[11px] text-paper/50 uppercase">{t('pat.paid')}</div>
            <div className="mt-1 text-[18px] font-semibold text-ready tabular-nums">{m(totals.paid)}</div>
          </div>
          <div className="card p-3">
            <div className="text-[11px] text-paper/50 uppercase">{totals.balance >= 0 ? t('pat.owes') : t('pat.credit')}</div>
            <div className={cx('mt-1 text-[18px] font-semibold tabular-nums', totals.balance > 0 && 'text-danger')}>{m(Math.abs(totals.balance))}</div>
          </div>
        </div>
      )}
      {payments.length === 0 ? (
        <Empty icon={Wallet}>{t('pay.empty')}</Empty>
      ) : (
        <div className="card">
          <DataTable head={[t('pay.when'), t('pay.method'), t('pay.note'), { label: t('pay.amount'), right: true }, '']}>
            {payments.map((p) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap">{fmt.full(p.paidAt, locale)}</Td>
                <Td>{t(`pay.methods.${p.method}`)}</Td>
                <Td className="text-paper/65">{p.note || '—'}</Td>
                <Td right className={cx('font-semibold', p.amount < 0 && 'text-danger')}>
                  {m(p.amount)}
                </Td>
                <Td right>
                  {isOwner && (
                    <button type="button" onClick={() => remove(p)} className="grid size-7 place-items-center rounded-full text-paper/40 hover:bg-white/8 hover:text-danger" aria-label={t('common.delete')}>
                      <Trash width={14} height={14} />
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
    </div>
  );
}

function MessagesTab({ messages }) {
  const { t, locale } = useI18n();
  if (!messages.length) return <Empty icon={Message}>{t('msg.empty')}</Empty>;
  return (
    <ul className="flex flex-col gap-2">
      {messages.map((x) => (
        <li key={x.id} className="card p-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-paper/50">
            {x.channel === 'whatsapp' ? <Whatsapp width={14} height={14} /> : <Message width={14} height={14} />}
            <span className="font-semibold text-paper/75">{t(`msg.kinds.${x.kind}`)}</span>
            <span>{x.toPhone}</span>
            <span className={cx('rounded-full px-2 py-0.5 font-semibold', x.status === 'failed' ? 'bg-coral/15 text-danger' : 'bg-white/8')}>{t(`msg.status.${x.status}`)}</span>
            <span className="ml-auto">{fmt.full(x.createdAt, locale)}</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-5 whitespace-pre-line text-paper/80">{x.body}</p>
          {x.error && <p className="mt-1 text-[11px] text-danger">{x.error}</p>}
        </li>
      ))}
    </ul>
  );
}

function DetailsTab({ p, company, isOwner, desk, onEdit, onDelete, onMerge }) {
  const { t, locale } = useI18n();
  const rows = [
    [t('pat.name'), p.name],
    [t('appt.phone'), p.phone],
    [t('appt.email'), p.email],
    [t('pat.idNumber'), p.idNumber],
    [t('pat.birthDate'), p.birthDate && fmt.long(p.birthDate, locale)],
    [t('pat.gender'), p.gender && t(p.gender === 'f' ? 'pat.genderF' : 'pat.genderM')],
    [t('pat.address'), p.address],
    [t('pat.company'), company?.name],
    [t('pat.source'), p.source],
    [t('pat.consentShort'), p.consent ? t('common.yes') : t('common.no')],
    [t('pat.created'), fmt.full(p.createdAt, locale)],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Panel
        title={t('pat.tabs.details')}
        action={
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Edit width={14} height={14} /> {t('common.edit')}
          </Button>
        }
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] font-medium tracking-wide text-paper/45 uppercase">{k}</dt>
              <dd className="mt-0.5 text-ui break-words">{v || '—'}</dd>
            </div>
          ))}
        </dl>
        {p.notes && (
          <div className="mt-4 border-t border-white/8 pt-3">
            <div className="text-[11px] font-medium tracking-wide text-paper/45 uppercase">{t('pat.notes')}</div>
            <p className="mt-1 text-ui whitespace-pre-line">{p.notes}</p>
          </div>
        )}
      </Panel>
      {(desk || isOwner) && (
        <Panel title={t('pat.manage')} className="h-fit">
          <div className="flex flex-col gap-2">
            {desk && (
              <Button variant="outline" size="sm" onClick={onMerge}>
                <Users width={14} height={14} /> {t('pat.merge')}
              </Button>
            )}
            {isOwner && (
              <Button variant="danger" size="sm" onClick={onDelete}>
                <Trash width={14} height={14} /> {t('pat.delete')}
              </Button>
            )}
            <p className="text-[11px] leading-4 text-paper/45">{t('pat.manageHint')}</p>
          </div>
        </Panel>
      )}
    </div>
  );
}

/** Join a duplicate file into this one (everything moves here, the other file is removed). */
function MergeModal({ biz, patient, onClose, onDone }) {
  const { t, tErr } = useI18n();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const [error, setError] = useState('');
  const { data } = useApi(q.trim().length >= 2 ? `/businesses/${biz.id}/patients${qs({ q: q.trim(), limit: 10 })}` : null);
  const hits = (data ?? []).filter((x) => x.id !== patient.id);
  const merge = async () => {
    if (!window.confirm(t('pat.mergeConfirm', { other: pick.name, name: patient.name }))) return;
    try {
      await api(`/businesses/${biz.id}/patients/${patient.id}/merge`, { method: 'POST', body: { otherId: pick.id } });
      onDone();
    } catch (e) {
      setError(tErr(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('pat.merge')}
      eyebrow={patient.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!pick} onClick={merge}>
            {t('pat.mergeDo')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-ui text-paper/65">{t('pat.mergeLead', { name: patient.name })}</p>
      <input className="input" autoFocus placeholder={t('pat.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-2 flex flex-col">
        {hits.map((x) => (
          <li key={x.id}>
            <button
              type="button"
              onClick={() => setPick(x)}
              className={cx('flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-white/5', pick?.id === x.id && 'bg-gold/12 ring-1 ring-gold/40')}
            >
              <Avatar name={x.name} size={30} />
              <span className="min-w-0">
                <span className="block truncate text-ui font-medium">{x.name}</span>
                <span className="block truncate text-[11px] text-paper/50">
                  {[x.phone, x.email].filter(Boolean).join(' · ')} · {t('pat.visitsN', { n: x.visits })}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}
