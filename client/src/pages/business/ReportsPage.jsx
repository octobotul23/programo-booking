import { useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { DataTable, DateRange, Dot, Page, PageHead, Panel, StatCard, Td, thisMonth, useApi } from '../../components/clinic.jsx';
import { Button, ErrorNote, LoadLine } from '../../components/ui.jsx';
import { Calendar, Check, Close, Download, User, Wallet } from '../../components/icons.jsx';
import { qs } from '../../lib/api.js';
import { fmt } from '../../lib/dates.js';
import { printPage, saveErrorKey } from '../../lib/device.js';
import { downloadCsv, money } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';

export default function ReportsPage() {
  const { biz, labels, desk, version } = useOutletContext();
  const { t, locale, lang } = useI18n();
  const toast = useToast();
  const [range, setRange] = useState(() => thisMonth(biz));
  const { data: r, error } = useApi(desk ? `/businesses/${biz.id}/reports${qs(range)}` : null, [version]);
  if (!desk) return <Navigate to=".." relative="path" replace />;
  const cur = biz.settings.currency;
  const m = (v) => money(v, cur, locale);
  const exportCsv = (name, head, rows) => downloadCsv(`${name}-${range.from}-${range.to}.csv`, head, rows, lang).catch((e) => toast(t(saveErrorKey(e, 'common.exportFailed'))));

  const sum = (rows, k) => rows.reduce((s, x) => s + (x[k] ?? 0), 0);
  const counts = (row) => [row.total, row.completed, row.cancelled, row.noShow, row.billed];
  const countHead = [t('dash.colTotal'), t('dash.colDone'), t('rep.cancelled'), t('rep.noShow'), t('dash.colBilled')];

  return (
    <Page>
      <PageHead title={t('menu.reports')} sub={t('rep.lead')}>
        <Button variant="ghost" size="sm" onClick={printPage} className="print:hidden">
          {t('cash.print')}
        </Button>
      </PageHead>
      <DateRange biz={biz} value={range} onChange={setRange} className="mt-4 print:hidden" />
      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {!r ? (
        <LoadLine className="mt-6" />
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard icon={Calendar} tone="#2f7fc1" label={t('dash.appointments')} value={sum(r.byCalendar, 'total')} sub={t('rep.onlineN', { n: r.bySource.find((s) => s.id === 'online')?.total ?? 0 })} />
            <StatCard icon={Check} tone="#1f9d63" label={t('dash.completed')} value={sum(r.byCalendar, 'completed')} sub={pct(sum(r.byCalendar, 'completed'), sum(r.byCalendar, 'total'))} />
            <StatCard icon={Close} tone="#e0673f" label={t('dash.lost')} value={sum(r.byCalendar, 'cancelled') + sum(r.byCalendar, 'noShow')} sub={t('rep.noShowsN', { n: sum(r.byCalendar, 'noShow') })} />
            <StatCard icon={User} tone="#12a39a" label={t('dash.newPatients')} value={r.newPatients} sub={labels.clients} />
            <StatCard icon={Wallet} tone="#6b5fd6" label={t('dash.collected')} value={m(sum(r.byMethod, 'total'))} sub={t('rep.billedV', { v: m(sum(r.byCalendar, 'billed')) })} />
          </div>

          <Panel title={t('rep.perDay')}>
            <DayChart rows={r.byDay} locale={locale} />
          </Panel>

          <ReportTable
            title={t('dash.perCalendar', { calendars: labels.calendars.toLowerCase() })}
            head={[t('dash.colName'), ...countHead, t('dash.colPaid')]}
            rows={r.byCalendar.map((x) => [<NameDot key="n" name={x.name} color={x.color} />, ...counts(x), x.paid])}
            csv={() => exportCsv(labels.calendars, [t('dash.colName'), ...countHead, t('dash.colPaid')], r.byCalendar.map((x) => [x.name, ...counts(x), x.paid]))}
            money={[5, 6]}
            m={m}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <ReportTable
              title={t('rep.byService')}
              head={[t('appt.service'), ...countHead]}
              rows={r.byService.map((x) => [x.name || t('appt.noService'), ...counts(x)])}
              csv={() => exportCsv(t('rep.byService'), [t('appt.service'), ...countHead], r.byService.map((x) => [x.name || t('appt.noService'), ...counts(x)]))}
              money={[5]}
              m={m}
            />
            <ReportTable
              title={t('rep.byCompany')}
              head={[t('pat.company'), labels.clients, ...countHead]}
              rows={r.byCompany.map((x) => [x.name || t('rep.noCompany'), x.patients, ...counts(x)])}
              csv={() => exportCsv(t('rep.byCompany'), [t('pat.company'), labels.clients, ...countHead], r.byCompany.map((x) => [x.name || t('rep.noCompany'), x.patients, ...counts(x)]))}
              money={[6]}
              m={m}
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ReportTable
              title={t('rep.byMethod')}
              head={[t('pay.method'), t('rep.count'), t('pay.amount')]}
              rows={r.byMethod.map((x) => [t(`pay.methods.${x.id}`), x.count, x.total])}
              csv={() => exportCsv(t('rep.byMethod'), [t('pay.method'), t('rep.count'), t('pay.amount')], r.byMethod.map((x) => [t(`pay.methods.${x.id}`), x.count, x.total]))}
              money={[2]}
              m={m}
            />
            <ReportTable
              title={t('rep.bySource')}
              head={[t('rep.source'), t('dash.colTotal')]}
              rows={r.bySource.map((x) => [t(`appt.source.${x.id}`), x.total])}
              m={m}
            />
          </div>
          <Panel title={`${t('rep.noShowList')} · ${r.noShows.length}`} bodyClass="p-0">
            {r.noShows.length === 0 ? (
              <p className="p-6 text-center text-ui text-paper/45">{t('rep.noNoShows')}</p>
            ) : (
              <DataTable head={[t('appt.date'), t('pay.patient'), t('appt.phone'), t('appt.calendar')]}>
                {r.noShows.map((a) => (
                  <tr key={a.id}>
                    <Td className="whitespace-nowrap">{fmt.full(a.start, locale)}</Td>
                    <Td>
                      {a.patientId ? (
                        <Link to={`../patients/${a.patientId}`} relative="path" className="font-medium hover:underline">
                          {a.clientName}
                        </Link>
                      ) : (
                        a.clientName
                      )}
                    </Td>
                    <Td>{a.clientPhone || '—'}</Td>
                    <Td>{a.calendarName}</Td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Panel>
        </div>
      )}
    </Page>
  );
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const NameDot = ({ name, color }) => (
  <span className="inline-flex items-center gap-2 font-medium">
    <Dot color={color} /> {name}
  </span>
);

function ReportTable({ title, head, rows, csv, money: moneyCols = [], m }) {
  const { t } = useI18n();
  return (
    <Panel
      title={title}
      bodyClass="p-0"
      action={
        csv &&
        rows.length > 0 && (
          <button type="button" onClick={csv} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gold-light hover:underline print:hidden">
            <Download width={14} height={14} /> {t('common.export')}
          </button>
        )
      }
    >
      {rows.length === 0 ? (
        <p className="p-6 text-center text-ui text-paper/45">{t('dash.noData')}</p>
      ) : (
        <DataTable head={head.map((h, i) => (i === 0 ? h : { label: h, right: true }))}>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-white/[0.03]">
              {row.map((v, j) => (
                <Td key={j} right={j > 0} className={j === row.length - 1 && moneyCols.includes(j) ? 'font-semibold' : ''}>
                  {moneyCols.includes(j) ? m(v) : v}
                </Td>
              ))}
            </tr>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}

/** Bars per day: completed (accent) on top of the rest (pale), cancellations as a red tick. */
function DayChart({ rows, locale }) {
  const { t } = useI18n();
  if (!rows.length) return <p className="py-6 text-center text-ui text-paper/45">{t('dash.noData')}</p>;
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div>
      <div className="thin-scroll flex h-48 items-end gap-1 overflow-x-auto pb-1">
        {rows.map((r) => (
          <div key={r.day} className="group flex h-full min-w-[18px] flex-1 flex-col items-center justify-end" title={`${fmt.short(r.day, locale)}: ${r.total} · ${t('dash.colDone')} ${r.completed}`}>
            <span className="mb-1 text-[10px] text-paper/50 opacity-0 group-hover:opacity-100">{r.total}</span>
            <div className="flex w-full max-w-[28px] flex-col justify-end overflow-hidden rounded-t-[4px]" style={{ height: `${(r.total / max) * 100}%` }}>
              {r.cancelled + r.noShow > 0 && <div className="bg-coral/70" style={{ height: `${((r.cancelled + r.noShow) / r.total) * 100}%` }} />}
              <div className="bg-gold/30" style={{ height: `${((r.total - r.completed - r.cancelled - r.noShow) / r.total) * 100}%` }} />
              <div className="bg-gold" style={{ height: `${(r.completed / r.total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-paper/45">
        <span>{fmt.short(rows[0].day, locale)}</span>
        <span>{fmt.short(rows[rows.length - 1].day, locale)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-paper/60">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-gold" /> {t('dash.colDone')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-gold/30" /> {t('rep.planned')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-coral/70" /> {t('dash.lost')}
        </span>
      </div>
    </div>
  );
}
