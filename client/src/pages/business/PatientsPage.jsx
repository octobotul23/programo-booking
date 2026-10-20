import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Avatar, DataTable, Page, PageHead, Td, useApi } from '../../components/clinic.jsx';
import { Button, Empty, ErrorNote, LoadLine } from '../../components/ui.jsx';
import { Download, Plus, Search, Users } from '../../components/icons.jsx';
import { api, qs } from '../../lib/api.js';
import { fmt } from '../../lib/dates.js';
import { saveErrorKey } from '../../lib/device.js';
import { downloadCsv, money } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';
import { PatientFormModal } from './clinicModals.jsx';

// how many files the list shows (more are reached by searching or filtering)
const LIST_CAP = 500;

export default function PatientsPage() {
  const { biz, labels, desk, version } = useOutletContext();
  const { t, locale, lang } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const [q, setQ] = useState(text);
  const companyId = params.get('companyId') ?? '';
  const sort = params.get('sort') ?? '';
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);

  // one more than is shown, only to know whether there are more
  const { data: found, error, loading } = useApi(`/businesses/${biz.id}/patients${qs({ q, companyId, sort, limit: LIST_CAP + 1 })}`, [version]);
  const more = found?.length > LIST_CAP;
  const rows = more ? found.slice(0, LIST_CAP) : found;
  const { data: companies } = useApi(`/businesses/${biz.id}/companies`);
  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const cur = biz.settings.currency;

  // a whole list is exported as shown; one cut off at LIST_CAP is fetched again, whole, for the file
  const exportCsv = async () => {
    try {
      const list = !more ? rows : await api(`/businesses/${biz.id}/patients${qs({ q, companyId, sort, export: 1 })}`);
      await downloadCsv(
        `${labels.clients}-${new Date().toISOString().slice(0, 10)}.csv`,
        [t('pat.name'), t('appt.phone'), t('appt.email'), t('pat.birthDate'), t('pat.company'), t('pat.visits'), t('pat.lastVisit'), t('pat.nextVisit'), ...(desk ? [t('pat.balance')] : [])],
        list.map((p) => [p.name, p.phone, p.email, p.birthDate, p.companyName ?? '', p.visits, p.lastVisit?.slice(0, 10) ?? '', p.nextVisit?.replace('T', ' ') ?? '', ...(desk ? [p.balance] : [])]),
        lang,
      );
    } catch (e) {
      toast(t(saveErrorKey(e, 'pat.exportFailed')));
    }
  };

  return (
    <Page>
      <PageHead title={labels.clients} sub={rows ? t(more ? 'pat.countFirstN' : 'pat.countN', { n: rows.length }) : ' '}>
        {rows?.length > 0 && (
          <Button variant="ghost" size="sm" onClick={exportCsv}>
            <Download width={15} height={15} /> {t('common.export')}
          </Button>
        )}
        <Button variant="gold" onClick={() => setAdding(true)}>
          <Plus width={16} height={16} /> {t('pat.add')}
        </Button>
      </PageHead>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search width={16} height={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-paper/40" />
          <input className="input pl-9" placeholder={t('pat.searchPh')} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {companies?.length > 0 && (
          <select className="input w-auto min-w-[180px]" value={companyId} onChange={(e) => setParam('companyId', e.target.value)} aria-label={t('pat.company')}>
            <option value="">{t('pat.allCompanies')}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select className="input w-auto" value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label={t('pat.sort')}>
          <option value="">{t('pat.sortName')}</option>
          <option value="new">{t('pat.sortNew')}</option>
        </select>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <div className="mt-4">
        {!rows ? (
          loading && <LoadLine />
        ) : rows.length === 0 ? (
          <Empty icon={Users}>{q ? t('search.none', { q }) : t('pat.empty')}</Empty>
        ) : (
          <>
            {/* phones: one card per patient */}
            <ul className="flex flex-col gap-2 md:hidden">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link to={String(p.id)} className="card flex items-center gap-3 p-3">
                    <Avatar name={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui font-semibold">{p.name}</span>
                      <span className="block truncate text-[12px] text-paper/50">{[p.phone, p.companyName].filter(Boolean).join(' · ') || '—'}</span>
                      <span className="block text-[11px] text-paper/45">
                        {t('pat.visitsN', { n: p.visits })}
                        {p.nextVisit ? ` · ${t('pat.nextShort')} ${fmt.short(p.nextVisit.slice(0, 10), locale)}` : ''}
                      </span>
                    </span>
                    {desk && p.balance > 0 && <span className="shrink-0 text-[12px] font-semibold text-danger">{money(p.balance, cur, locale)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
            {/* tablets and computers: table */}
            <div className="card hidden md:block">
              <DataTable
                head={[
                  t('pat.name'),
                  t('appt.phone'),
                  t('pat.company'),
                  { label: t('pat.visits'), right: true },
                  t('pat.lastVisit'),
                  t('pat.nextVisit'),
                  ...(desk ? [{ label: t('pat.balance'), right: true }] : []),
                ]}
              >
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => navigate(String(p.id))} className="cursor-pointer hover:bg-white/[0.04]">
                    <Td>
                      <Link to={String(p.id)} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <Avatar name={p.name} size={32} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{p.name}</span>
                          {p.email && <span className="block truncate text-[11px] text-paper/45">{p.email}</span>}
                        </span>
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">{p.phone || '—'}</Td>
                    <Td className="text-paper/70">{p.companyName || '—'}</Td>
                    <Td right>{p.visits}</Td>
                    <Td className="whitespace-nowrap text-paper/70">{p.lastVisit ? fmt.short(p.lastVisit.slice(0, 10), locale) : '—'}</Td>
                    <Td className="whitespace-nowrap">{p.nextVisit ? `${fmt.short(p.nextVisit.slice(0, 10), locale)}, ${fmt.time(p.nextVisit)}` : '—'}</Td>
                    {desk && (
                      <Td right className={p.balance > 0 ? 'font-semibold text-danger' : p.balance < 0 ? 'text-ready' : 'text-paper/50'}>
                        {money(p.balance, cur, locale)}
                      </Td>
                    )}
                  </tr>
                ))}
              </DataTable>
            </div>
          </>
        )}
      </div>

      {adding && (
        <PatientFormModal
          biz={biz}
          onClose={() => setAdding(false)}
          onSaved={(p) => {
            setAdding(false);
            navigate(String(p.id));
          }}
        />
      )}
    </Page>
  );
}
