import { useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Dot, Page, PageHead, useApi } from '../../components/clinic.jsx';
import { Button, Empty, ErrorNote, LoadLine, StatusBadge, cx } from '../../components/ui.jsx';
import { Bell, Calendar, Close, Globe, Clock } from '../../components/icons.jsx';
import { api } from '../../lib/api.js';
import { fmt, nowIn } from '../../lib/dates.js';
import { useI18n } from '../../lib/i18n.jsx';

const KIND_ICON = { booked: Calendar, online_booking: Globe, online_request: Clock, cancelled: Close, client_cancelled: Close, rescheduled: Calendar };
const KIND_TONE = { booked: '#2f7fc1', online_booking: '#12a39a', online_request: '#c98516', cancelled: '#e0673f', client_cancelled: '#e0673f', rescheduled: '#6b5fd6' };

export default function NotificationsPage() {
  const { biz, version, setUnread } = useOutletContext();
  const { t, locale } = useI18n();
  const { data, error, loading, reload } = useApi(`/businesses/${biz.id}/notifications`, [version]);
  const today = nowIn(biz.settings.timezone).slice(0, 10);

  // opening the page marks everything as read (the list keeps showing what was new)
  useEffect(() => {
    const top = data?.items[0];
    if (!top || top.id <= data.lastSeen) return;
    api(`/businesses/${biz.id}/notifications/seen`, { method: 'POST', body: { lastId: top.id } })
      .then(() => setUnread(0))
      .catch(() => {});
  }, [biz.id, data, setUnread]);

  // newest day first; one group per day even if ids and times are not in the same order
  const byDay = new Map();
  for (const n of [...(data?.items ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)) {
    const day = n.createdAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { day, items: [] });
    byDay.get(day).items.push(n);
  }
  const groups = [...byDay.values()];

  return (
    <Page className="max-w-[900px]">
      <PageHead title={t('menu.notifications')} sub={t('notif.lead')}>
        <Button variant="ghost" size="sm" onClick={reload}>
          {t('notif.refresh')}
        </Button>
      </PageHead>
      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <div className="mt-5">
        {!data ? (
          loading && <LoadLine />
        ) : groups.length === 0 ? (
          <Empty icon={Bell}>{t('notif.empty')}</Empty>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <section key={g.day}>
                <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-paper/50 uppercase">
                  {g.day === today ? t('range.today') : fmt.long(g.day, locale)}
                </h2>
                <ul className="card divide-y divide-white/8 overflow-hidden">
                  {g.items.map((n) => {
                    const Icon = KIND_ICON[n.kind] ?? Bell;
                    const start = n.appointmentStart || n.data.start;
                    return (
                      <li key={n.id} className={cx('relative', n.unread && 'bg-gold/[0.06]')}>
                        {n.unread && <span className="absolute inset-y-0 left-0 w-[3px] bg-gold" />}
                        <Link
                          to={start ? `../calendar?date=${start.slice(0, 10)}${n.appointmentId ? `&open=${n.appointmentId}` : ''}` : '../calendar'}
                          relative="path"
                          className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.04]"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-full text-[#fff]" style={{ background: KIND_TONE[n.kind] ?? '#7b8a90' }}>
                            <Icon width={17} height={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-ui leading-5">
                              {t(`notif.kinds.${n.kind}`, {
                                name: n.data.clientName || '—',
                                when: n.data.start ? fmt.full(n.data.start, locale) : '',
                                from: n.data.from ? fmt.full(n.data.from, locale) : '',
                                actor: n.actorName || t('notif.someone'),
                              })}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-paper/50">
                              {n.calendarName && (
                                <span className="inline-flex items-center gap-1.5">
                                  <Dot color={n.calendarColor} /> {n.calendarName}
                                </span>
                              )}
                              <span>{fmt.time(n.createdAt)}</span>
                              {n.actorName && <span>· {n.actorName}</span>}
                            </span>
                          </span>
                          {n.appointmentStatus && <StatusBadge status={n.appointmentStatus} className="hidden sm:inline-flex" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
