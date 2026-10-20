import { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { Avatar, Dot, Page, PageHead, Panel, useApi } from '../../components/clinic.jsx';
import { Empty, LoadLine, StatusBadge } from '../../components/ui.jsx';
import { Building, Search } from '../../components/icons.jsx';
import { qs } from '../../lib/api.js';
import { fmt } from '../../lib/dates.js';
import { useI18n } from '../../lib/i18n.jsx';

export default function SearchPage() {
  const { biz, labels, desk } = useOutletContext();
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = params.get('q') ?? '';

  // typing updates the address (so Back and refresh keep the search) after a short pause
  useEffect(() => {
    const id = setTimeout(() => text !== q && setParams(text ? { q: text } : {}, { replace: true }), 250);
    return () => clearTimeout(id);
  }, [text, q, setParams]);
  useEffect(() => setText(params.get('q') ?? ''), [params]);

  const { data, loading } = useApi(q.trim().length >= 2 ? `/businesses/${biz.id}/search${qs({ q: q.trim() })}` : null);
  const total = data ? data.patients.length + data.appointments.length + data.companies.length : 0;

  return (
    <Page className="max-w-[1100px]">
      <PageHead title={t('menu.search')} sub={t('search.lead')} />
      <label className="relative mt-5 block">
        <Search width={18} height={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-paper/40" />
        <input
          autoFocus
          className="input h-12 pl-11 text-[15px]"
          placeholder={t('search.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      {q.trim().length < 2 ? (
        <p className="mt-8 text-center text-ui text-paper/45">{t('search.hint')}</p>
      ) : loading && !data ? (
        <LoadLine className="mt-6" />
      ) : total === 0 ? (
        <div className="mt-6">
          <Empty icon={Search}>{t('search.none', { q })}</Empty>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {data.patients.length > 0 && (
            <Panel title={`${labels.clients} · ${data.patients.length}`} bodyClass="p-2">
              <ul>
                {data.patients.map((p) => (
                  <li key={p.id}>
                    <Link to={`../patients/${p.id}`} relative="path" className="flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-white/5">
                      <Avatar name={p.name} size={34} />
                      <span className="min-w-0">
                        <span className="block truncate text-ui font-medium">{p.name}</span>
                        <span className="block truncate text-[12px] text-paper/50">{[p.phone, p.email, p.birthDate].filter(Boolean).join(' · ')}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {data.appointments.length > 0 && (
            <Panel title={`${t('nav.appointments')} · ${data.appointments.length}`} bodyClass="p-2">
              <ul>
                {data.appointments.map((a) => (
                  <li key={a.id}>
                    <Link to={`../calendar?date=${a.start.slice(0, 10)}&open=${a.id}`} relative="path" className="flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-white/5">
                      <Dot color={a.calendarColor} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-medium">{a.clientName}</span>
                        <span className="block truncate text-[12px] text-paper/50">
                          {fmt.full(a.start, locale)} · {a.calendarName}
                          {a.serviceName ? ` · ${a.serviceName}` : ''}
                        </span>
                      </span>
                      <StatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {data.companies.length > 0 && (
            <Panel title={`${t('menu.companies')} · ${data.companies.length}`} bodyClass="p-2">
              <ul>
                {data.companies.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={desk ? `../companies?open=${c.id}` : `../patients?companyId=${c.id}`}
                      relative="path"
                      className="flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-white/5"
                    >
                      <Building width={18} height={18} className="text-paper/50" />
                      <span className="min-w-0">
                        <span className="block truncate text-ui font-medium">{c.name}</span>
                        <span className="block truncate text-[12px] text-paper/50">{[c.taxId, c.discount ? `-${c.discount}%` : ''].filter(Boolean).join(' · ')}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </Page>
  );
}
