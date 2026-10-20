import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { DataTable, DateRange, Dot, Page, PageHead, Panel, StatCard, Td, thisMonth, useApi } from '../../components/clinic.jsx';
import { Empty, ErrorNote, LoadLine, Modal, StatusBadge } from '../../components/ui.jsx';
import { ArrowRight, Calendar, Cash, Check, Close, Globe, Users, User, Wallet, Clock } from '../../components/icons.jsx';
import { qs } from '../../lib/api.js';
import { fmt } from '../../lib/dates.js';
import { money } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';

// labels that start with the business's own word ("pacienți") still need a capital letter
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const TONES = { teal: '#12a39a', blue: '#2f7fc1', green: '#1f9d63', coral: '#e0673f', violet: '#6b5fd6', amber: '#c98516' };

export default function DashboardPage() {
  const { biz, labels, version } = useOutletContext();
  const { t, locale } = useI18n();
  const [range, setRange] = useState(() => thisMonth(biz));
  const { data: d, error } = useApi(`/businesses/${biz.id}/dashboard${qs(range)}`, [version]);
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [list, setList] = useState(null);
  const cur = biz.settings.currency;
  const m = (v) => money(v, cur, locale);

  const cards = d && [
    {
      key: 'newPatients',
      icon: User,
      tone: TONES.teal,
      label: t('dash.newPatients'),
      value: d.patients.period.new,
      sub: t('dash.todayN', { n: d.patients.today.new }),
    },
    {
      key: 'uniquePatients',
      icon: Users,
      tone: TONES.teal,
      label: cap(t('dash.seenPatients', { clients: labels.clients.toLowerCase() })),
      value: d.patients.period.unique,
      sub: t('dash.todayN', { n: d.patients.today.unique }),
    },
    {
      key: 'all',
      icon: Calendar,
      tone: TONES.blue,
      label: t('dash.appointments'),
      value: d.appointments.period.total,
      sub: t('dash.todayN', { n: d.appointments.today.total }),
    },
    {
      key: 'completed',
      icon: Check,
      tone: TONES.green,
      label: t('dash.completed'),
      value: d.appointments.period.completed,
      sub: t('dash.confirmedN', { n: d.appointments.period.confirmed }),
    },
    {
      key: 'lost',
      icon: Close,
      tone: TONES.coral,
      label: t('dash.lost'),
      value: d.appointments.period.lost,
      sub: t('dash.lostSplit', { c: d.appointments.period.cancelled, n: d.appointments.period.noShow }),
    },
    {
      key: 'pending',
      icon: Clock,
      tone: TONES.amber,
      label: t('dash.pending'),
      value: d.appointments.period.pending,
      sub: t('dash.onlineN', { n: d.appointments.period.online }),
    },
    {
      key: 'payments',
      icon: Wallet,
      tone: TONES.green,
      label: d.canSeeAllMoney ? t('dash.collected') : t('dash.collectedMine'),
      value: m(d.money.period),
      sub: t('dash.todayMoney', { v: m(d.money.today) }),
    },
    {
      key: 'owed',
      icon: Cash,
      tone: TONES.violet,
      label: t('dash.owed'),
      value: m(d.money.owed),
      sub: t('dash.owedSub'),
      noTable: true,
    },
  ];

  return (
    <Page>
      <PageHead title={t('menu.dashboard')} sub={biz.name}>
        <DateRange biz={biz} value={range} onChange={setRange} />
      </PageHead>
      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {!d ? (
        <LoadLine className="mt-6" />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
            {cards.map((c) => (
              <StatCard
                key={c.key}
                icon={c.icon}
                tone={c.tone}
                label={c.label}
                value={c.value}
                sub={c.sub}
                infoLabel={t('dash.whatIsThis')}
                tableLabel={t('dash.showRows')}
                onInfo={() => setInfo(c)}
                onTable={c.noTable ? (d.canSeeAllMoney ? () => navigate(`/app/${biz.id}/cashier`) : null) : () => setList(c)}
              />
            ))}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_380px]">
            <Panel title={t('dash.perCalendar', { calendars: labels.calendars.toLowerCase() })} bodyClass="p-0">
              <PerCalendar rows={d.perCalendar} m={m} />
            </Panel>
            <Panel
              title={t('dash.upcoming')}
              action={
                <Link to="../calendar" relative="path" className="flex items-center gap-1 text-[12px] font-medium text-gold-light hover:underline">
                  {t('nav.calendar')} <ArrowRight width={14} height={14} />
                </Link>
              }
              bodyClass="p-2"
            >
              {d.upcoming.length === 0 ? (
                <p className="px-2 py-6 text-center text-ui text-paper/45">{t('dash.noUpcoming')}</p>
              ) : (
                <ul className="flex flex-col">
                  {d.upcoming.map((a) => (
                    <li key={a.id}>
                      <Link
                        to={`../calendar?date=${a.start.slice(0, 10)}&open=${a.id}`}
                        relative="path"
                        className="flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-white/5"
                      >
                        <span className="w-12 shrink-0 text-[14px] font-semibold tabular-nums">{fmt.time(a.start)}</span>
                        <Dot color={a.calendarColor} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{a.clientName}</span>
                          <span className="block truncate text-[11px] text-paper/50">
                            {a.calendarName}
                            {a.serviceName ? ` · ${a.serviceName}` : ''}
                          </span>
                        </span>
                        <StatusBadge status={a.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}

      <Modal open={!!info} onClose={() => setInfo(null)} title={info?.label}>
        <p className="text-ui leading-6 text-paper/75">{info && t(`dash.info.${info.key}`)}</p>
        <p className="mt-3 text-[12px] text-paper/45">
          {t('dash.rangeNote', { from: fmt.short(range.from, locale), to: fmt.short(range.to, locale) })}
        </p>
      </Modal>
      {list && <ListModal biz={biz} card={list} range={range} onClose={() => setList(null)} m={m} />}
    </Page>
  );
}

function PerCalendar({ rows, m }) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (!rows.length) return <p className="p-6 text-center text-ui text-paper/45">{t('dash.noData')}</p>;
  return (
    <DataTable
      min={540}
      head={[
        t('dash.colName'),
        { label: t('dash.colTotal'), right: true },
        { label: t('dash.colDone'), right: true },
        { label: t('dash.colLost'), right: true },
        { label: t('dash.colPatients'), right: true },
        { label: t('dash.colBilled'), right: true },
        { label: t('dash.colPaid'), right: true },
      ]}
    >
      {rows.map((r) => (
        <tr key={r.id} className="hover:bg-white/[0.03]">
          <Td>
            <div className="flex items-center gap-2">
              <Dot color={r.color} />
              <span className="font-medium">{r.name}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full" style={{ width: `${(r.total / max) * 100}%`, background: r.color }} />
            </div>
          </Td>
          <Td right>{r.total}</Td>
          <Td right>{r.completed}</Td>
          <Td right className={r.cancelled + r.noShow ? 'text-danger' : ''}>
            {r.cancelled + r.noShow}
          </Td>
          <Td right>{r.patients}</Td>
          <Td right>{m(r.billed)}</Td>
          <Td right className="font-semibold">
            {m(r.paid)}
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}

function ListModal({ biz, card, range, onClose, m }) {
  const { t, locale } = useI18n();
  const [span, setSpan] = useState('period');
  const { data, error, loading } = useApi(`/businesses/${biz.id}/dashboard/list${qs({ metric: card.key, ...range, span: span === 'today' ? 'today' : '' })}`);
  const rows = data?.rows ?? [];
  return (
    <Modal open onClose={onClose} title={card.label} wide>
      <div className="mb-3 flex gap-1">
        {['period', 'today'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSpan(k)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${span === k ? 'bg-gold text-white' : 'text-paper/65 hover:bg-white/8'}`}
          >
            {k === 'today' ? t('range.today') : `${fmt.short(range.from, locale)} – ${fmt.short(range.to, locale)}`}
          </button>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && !data ? (
        <LoadLine />
      ) : rows.length === 0 ? (
        <Empty>{t('dash.noData')}</Empty>
      ) : data.type === 'patients' ? (
        <ul className="divide-y divide-white/8">
          {rows.map((p) => (
            <li key={p.id}>
              <Link to={`/app/${biz.id}/patients/${p.id}`} onClick={onClose} className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-white/5">
                <span className="min-w-0">
                  <span className="block truncate text-ui font-medium">{p.name}</span>
                  <span className="block truncate text-[12px] text-paper/50">{[p.phone, p.email].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="shrink-0 text-[12px] text-paper/50">{p.visits ? t('pat.visitsN', { n: p.visits }) : fmt.short(p.createdAt.slice(0, 10), locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : data.type === 'payments' ? (
        <ul className="divide-y divide-white/8">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-1 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-ui font-medium">{p.patientName || '—'}</span>
                <span className="block text-[12px] text-paper/50">
                  {fmt.full(p.paidAt, locale)} · {t(`pay.methods.${p.method}`)}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{m(p.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-white/8">
          {rows.map((a) => (
            <li key={a.id}>
              <Link
                to={`/app/${biz.id}/calendar?date=${a.start.slice(0, 10)}&open=${a.id}`}
                onClick={onClose}
                className="flex items-center gap-3 px-1 py-2.5 hover:bg-white/5"
              >
                <Dot color={a.calendarColor} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui font-medium">{a.clientName}</span>
                  <span className="block truncate text-[12px] text-paper/50">
                    {fmt.full(a.start, locale)} · {a.calendarName}
                    {a.serviceName ? ` · ${a.serviceName}` : ''}
                    {a.source === 'online' && (
                      <>
                        {' · '}
                        <Globe width={11} height={11} className="inline" /> {t('dash.online')}
                      </>
                    )}
                  </span>
                </span>
                <StatusBadge status={a.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-paper/45">{t('dash.rowsN', { n: rows.length })}</p>
    </Modal>
  );
}
