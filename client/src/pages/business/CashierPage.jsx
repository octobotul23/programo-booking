import { useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { Avatar, DataTable, DateRange, Dot, Page, PageHead, Td, thisMonth, useApi } from '../../components/clinic.jsx';
import { Button, Empty, ErrorNote, LoadLine, Modal, StatusBadge, cx } from '../../components/ui.jsx';
import { Card, Cash, Download, Message, Plus, Send, Trash, Wallet } from '../../components/icons.jsx';
import { api, qs } from '../../lib/api.js';
import { fmt } from '../../lib/dates.js';
import { printPage, saveErrorKey } from '../../lib/device.js';
import { downloadCsv, money } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';
import { PaymentModal } from './clinicModals.jsx';

const METHOD_ICON = { cash: Cash, card: Card, transfer: Send, other: Message };

export default function CashierPage() {
  const { biz, desk, version } = useOutletContext();
  const { t, tErr, locale, lang } = useI18n();
  const toast = useToast();
  const [range, setRange] = useState(() => thisMonth(biz));
  const [method, setMethod] = useState('');
  const [tab, setTab] = useState('payments');
  const [paying, setPaying] = useState(null);
  const [picking, setPicking] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((x) => x + 1);
  const { data, error } = useApi(desk ? `/businesses/${biz.id}/payments${qs({ ...range, method })}` : null, [version, tick]);
  const { data: unpaid } = useApi(desk ? `/businesses/${biz.id}/payments/unpaid${qs(range)}` : null, [version, tick]);
  if (!desk) return <Navigate to=".." relative="path" replace />;
  const cur = biz.settings.currency;
  const m = (v) => money(v, cur, locale);
  const isOwner = biz.me.role === 'owner';

  const remove = async (p) => {
    if (!window.confirm(t('pay.deleteConfirm'))) return;
    try {
      await api(`/businesses/${biz.id}/payments/${p.id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      toast(tErr(e));
    }
  };

  const exportCsv = () =>
    downloadCsv(
      `${t('menu.cashier')}-${range.from}-${range.to}.csv`,
      [t('pay.when'), t('pay.patient'), t('pay.method'), t('pay.amount'), t('appt.calendar'), t('appt.service'), t('pay.note'), t('pay.by')],
      data.payments.map((p) => [p.paidAt.replace('T', ' '), p.patientName ?? '', t(`pay.methods.${p.method}`), p.amount, p.calendarName ?? '', p.serviceName ?? '', p.note, p.createdByName ?? '']),
      lang,
    ).catch((e) => toast(t(saveErrorKey(e, 'common.exportFailed'))));

  const openFor = async (patientId, appointment) => {
    try {
      const file = await api(`/businesses/${biz.id}/patients/${patientId}`);
      setPaying({ patient: file.patient, appointments: file.appointments, appointment: appointment && file.appointments.find((a) => a.id === appointment.id) });
    } catch (e) {
      toast(tErr(e));
    }
  };

  const unpaidTotal = (unpaid ?? []).reduce((s, a) => s + (a.price - a.paid), 0);

  return (
    <Page>
      <PageHead title={t('menu.cashier')} sub={t('cash.lead')}>
        <Button variant="ghost" size="sm" onClick={printPage} className="print:hidden">
          {t('cash.print')}
        </Button>
        {data?.payments.length > 0 && (
          <Button variant="ghost" size="sm" onClick={exportCsv} className="print:hidden">
            <Download width={15} height={15} /> {t('common.export')}
          </Button>
        )}
        <Button variant="gold" onClick={() => setPicking(true)} className="print:hidden">
          <Plus width={16} height={16} /> {t('cash.newPayment')}
        </Button>
      </PageHead>

      <DateRange biz={biz} value={range} onChange={setRange} className="mt-4 print:hidden" />
      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {!data ? (
        <LoadLine className="mt-6" />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
            <button
              type="button"
              onClick={() => setMethod('')}
              className={cx('stat-card col-span-2 p-4 text-left sm:col-span-1 lg:col-span-2', method === '' && 'ring-2 ring-gold')}
            >
              <div className="text-[12px] opacity-85">{t('cash.total', { n: data.totals.count })}</div>
              <div className="stat-value mt-1 text-[26px] font-semibold tabular-nums">{m(data.totals.total)}</div>
              <div className="mt-1 text-[11px] opacity-75">
                {fmt.short(data.from, locale)} – {fmt.short(data.to, locale)}
              </div>
            </button>
            {['cash', 'card', 'transfer', 'other'].map((k) => {
              const Icon = METHOD_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMethod(method === k ? '' : k)}
                  className={cx('card p-3 text-left transition-colors hover:border-white/25', method === k && 'ring-2 ring-gold')}
                >
                  <div className="flex items-center gap-2 text-[12px] text-paper/60">
                    <Icon width={15} height={15} /> {t(`pay.methods.${k}`)}
                  </div>
                  <div className="mt-1.5 text-[18px] font-semibold tabular-nums">{m(data.totals[k])}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex gap-1 border-b border-white/10 print:hidden">
            {[
              ['payments', `${t('cash.tabPayments')} · ${data.payments.length}`],
              ['unpaid', `${t('cash.tabUnpaid')} · ${unpaid?.length ?? '…'}`],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cx('-mb-px border-b-2 px-4 py-2.5 text-ui font-medium', tab === k ? 'border-gold text-gold-light' : 'border-transparent text-paper/60 hover:text-paper')}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === 'payments' ? (
              data.payments.length === 0 ? (
                <Empty icon={Wallet}>{t('pay.empty')}</Empty>
              ) : (
                <div className="card">
                  <DataTable head={[t('pay.when'), t('pay.patient'), t('cash.forWhat'), t('pay.method'), { label: t('pay.amount'), right: true }, t('pay.by'), '']}>
                    {data.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.03]">
                        <Td className="whitespace-nowrap">{fmt.full(p.paidAt, locale)}</Td>
                        <Td>
                          {p.patientId ? (
                            <Link to={`../patients/${p.patientId}`} relative="path" className="font-medium hover:underline">
                              {p.patientName}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </Td>
                        <Td className="text-paper/65">
                          {[p.serviceName, p.calendarName].filter(Boolean).join(' · ') || p.note || '—'}
                          {p.appointmentStart && <span className="block text-[11px] text-paper/45">{fmt.full(p.appointmentStart, locale)}</span>}
                        </Td>
                        <Td>{t(`pay.methods.${p.method}`)}</Td>
                        <Td right className={cx('font-semibold', p.amount < 0 && 'text-danger')}>
                          {m(p.amount)}
                        </Td>
                        <Td className="text-[12px] text-paper/55">{p.createdByName || '—'}</Td>
                        <Td right>
                          {isOwner && (
                            <button type="button" onClick={() => remove(p)} className="grid size-7 place-items-center rounded-full text-paper/40 hover:bg-white/8 hover:text-danger print:hidden" aria-label={t('common.delete')}>
                              <Trash width={14} height={14} />
                            </button>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              )
            ) : !unpaid ? (
              <LoadLine />
            ) : unpaid.length === 0 ? (
              <Empty icon={Wallet}>{t('cash.noUnpaid')}</Empty>
            ) : (
              <>
                <p className="mb-3 text-ui text-paper/65">{t('cash.unpaidTotal', { v: m(unpaidTotal), n: unpaid.length })}</p>
                <div className="card">
                  <DataTable head={[t('appt.date'), t('pay.patient'), t('appt.calendar'), t('appt.status'), { label: t('appt.price'), right: true }, { label: t('cash.left'), right: true }, '']}>
                    {unpaid.map((a) => (
                      <tr key={a.id} className="hover:bg-white/[0.03]">
                        <Td className="whitespace-nowrap">{fmt.full(a.start, locale)}</Td>
                        <Td>
                          <span className="flex items-center gap-2">
                            <Avatar name={a.clientName} size={26} />
                            {a.patientId ? (
                              <Link to={`../patients/${a.patientId}`} relative="path" className="font-medium hover:underline">
                                {a.clientName}
                              </Link>
                            ) : (
                              a.clientName
                            )}
                          </span>
                        </Td>
                        <Td>
                          <span className="inline-flex items-center gap-2">
                            <Dot color={biz.calendars.find((c) => c.id === a.calendarId)?.color} /> {a.calendarName}
                          </span>
                          {a.serviceName && <span className="block text-[11px] text-paper/50">{a.serviceName}</span>}
                        </Td>
                        <Td>
                          <StatusBadge status={a.status} />
                        </Td>
                        <Td right>{m(a.price)}</Td>
                        <Td right className="font-semibold text-danger">
                          {m(a.price - a.paid)}
                        </Td>
                        <Td right>
                          {a.patientId && (
                            <button type="button" onClick={() => openFor(a.patientId, a)} className="rounded-full bg-gold/15 px-3 py-1 text-[12px] font-semibold text-gold-light hover:bg-gold/25">
                              {t('pat.pay')}
                            </button>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {picking && (
        <PickPatientModal
          biz={biz}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setPicking(false);
            openFor(p.id);
          }}
        />
      )}
      {paying && (
        <PaymentModal
          biz={biz}
          patient={paying.patient}
          appointments={paying.appointments}
          appointment={paying.appointment}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            reload();
          }}
        />
      )}
    </Page>
  );
}

/** Search a patient file by name, phone or personal code. */
export function PickPatientModal({ biz, onClose, onPick, title }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const { data, loading } = useApi(`/businesses/${biz.id}/patients${qs({ q: q.trim(), limit: 12, sort: q.trim() ? '' : 'new' })}`);
  return (
    <Modal open onClose={onClose} title={title ?? t('cash.pickPatient')}>
      <input className="input" autoFocus placeholder={t('pat.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-2 flex min-h-[120px] flex-col">
        {loading && !data && <LoadLine />}
        {(data ?? []).map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-white/5">
              <Avatar name={p.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-medium">{p.name}</span>
                <span className="block truncate text-[11px] text-paper/50">{[p.phone, p.companyName].filter(Boolean).join(' · ')}</span>
              </span>
              {p.balance > 0 && <span className="text-[12px] font-semibold text-danger">{money(p.balance, biz.settings.currency)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
