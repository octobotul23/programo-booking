import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, LangSwitch, PageLoader, Wordmark, cx, ErrorNote } from '../../components/ui.jsx';
import {
  ArrowUpRight,
  Bell,
  Building,
  Calendar,
  Chart,
  ChevronDown,
  Close,
  Help,
  Home,
  List,
  Logout,
  Menu,
  Message,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  TYPE_ICONS,
  User,
  Users,
  Wallet,
} from '../../components/icons.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { nowIn } from '../../lib/dates.js';
import { initials } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useTheme } from '../../lib/theme.jsx';
import { useToast } from '../../lib/toast.jsx';
import AppointmentModal from './AppointmentModal.jsx';

/** Words a business uses for its calendars / clients (custom or type default). */
export function useLabels(biz) {
  const { t } = useI18n();
  return {
    calendars: biz?.settings.calendarLabel || t(`calLabel.${biz?.type ?? 'other'}`),
    clients: biz?.settings.clientLabel || t(`clientLabelDefault.${biz?.type ?? 'other'}`),
  };
}

/** Owner and "all calendars" staff (reception): money, companies and reports. */
export const isDesk = (biz) => biz?.me.role === 'owner' || biz?.me.access === 'all';

export default function BusinessLayout() {
  const { bid } = useParams();
  const { t, tErr } = useI18n();
  const { user, businesses, logout, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const loc = useLocation();
  const [biz, setBiz] = useState(null);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [unread, setUnread] = useState(0);
  const [quickBook, setQuickBook] = useState(false);
  // bumped after changes made from the top bar so the open page reloads its data
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const reload = useCallback(
    () =>
      api(`/businesses/${bid}`)
        .then((b) => {
          setBiz(b);
          setError('');
          return b;
        })
        .catch((e) => setError(tErr(e))),
    [bid, tErr],
  );

  useEffect(() => {
    setBiz(null);
    reload();
  }, [reload]);

  // unread notifications: on open, every minute, and whenever the page changes
  const loadUnread = useCallback(
    () =>
      api(`/businesses/${bid}/notifications/count`)
        .then((r) => setUnread(r.unread))
        .catch(() => {}),
    [bid],
  );
  useEffect(() => {
    loadUnread();
    const id = setInterval(() => document.visibilityState === 'visible' && loadUnread(), 60_000);
    return () => clearInterval(id);
  }, [loadUnread]);
  useEffect(() => {
    setDrawer(false);
    loadUnread();
  }, [loc.pathname, loadUnread]);

  const labels = useLabels(biz);

  if (error)
    return (
      <div className="mx-auto max-w-[480px] p-10">
        <ErrorNote>{error}</ErrorNote>
        <Button className="mt-4" onClick={() => navigate('/app')}>
          {t('common.back')}
        </Button>
      </div>
    );
  if (!biz) return <PageLoader />;

  const desk = isDesk(biz);
  const nav = [
    ['', Home, t('menu.dashboard'), true],
    ['calendar', Calendar, t('nav.calendar')],
    ['appointments', List, t('nav.appointments')],
    ['patients', Users, labels.clients],
    desk && ['cashier', Wallet, t('menu.cashier')],
    desk && ['reports', Chart, t('menu.reports')],
    desk && ['companies', Building, t('menu.companies')],
    ['notifications', Bell, t('menu.notifications'), false, unread],
    ['messages', Message, t('menu.messages')],
    ['search', Search, t('menu.search')],
    ['settings', Settings, t('nav.settings')],
    ['account', User, t('menu.account')],
    ['support', Help, t('menu.support')],
  ].filter(Boolean);

  const menu = (
    <SideMenu
      biz={biz}
      nav={nav}
      user={user}
      businesses={businesses}
      onLogout={logout}
      onSwitch={(id) => navigate(`/app/${id}`)}
      onClose={drawer ? () => setDrawer(false) : null}
    />
  );
  const today = nowIn(biz.settings.timezone).slice(0, 10);

  return (
    <div className="min-h-dvh lg:pl-[244px] print:pl-0">
      {/* side menu (desktop) */}
      <aside className="side-dark fixed inset-y-0 left-0 z-40 hidden w-[244px] lg:block print:hidden">{menu}</aside>

      {/* side menu (phone / tablet drawer) */}
      {drawer && (
        <div className="fixed inset-0 z-[90] lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <aside className="side-dark absolute inset-y-0 left-0 w-[min(300px,86vw)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] animate-pop shadow-2xl">{menu}</aside>
        </div>
      )}

      <header className="topbar sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] print:hidden items-center gap-2 px-3 backdrop-blur-xl md:px-5">
        <button type="button" onClick={() => setDrawer(true)} className="grid size-10 place-items-center rounded-full hover:bg-white/15 lg:hidden" aria-label={t('menu.open')}>
          <Menu width={20} height={20} />
        </button>
        <Link to={`/app/${biz.id}`} className="min-w-0 truncate text-[15px] font-semibold lg:hidden">
          {biz.name}
        </Link>
        <TopSearch biz={biz} />
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setQuickBook(true)}
            className="mr-1 flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3 text-[13px] font-semibold hover:bg-white/25"
            title={t('menu.newAppointment')}
          >
            <Plus width={16} height={16} />
            <span className="hidden sm:inline">{t('menu.newShort')}</span>
          </button>
          <NavLink to="notifications" className="relative grid size-10 place-items-center rounded-full hover:bg-white/15" aria-label={t('menu.notifications')}>
            <Bell width={19} height={19} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] leading-none font-bold text-[#fff]">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
          <button
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="grid size-10 place-items-center rounded-full hover:bg-white/15"
            title={theme === 'light' ? t('menu.themeDark') : t('menu.themeLight')}
            aria-label={theme === 'light' ? t('menu.themeDark') : t('menu.themeLight')}
          >
            {theme === 'light' ? <Moon width={18} height={18} /> : <Sun width={18} height={18} />}
          </button>
          <LangSwitch className="hidden px-2 sm:inline-flex" />
          <UserMenu user={user} onLogout={logout} />
        </div>
      </header>

      <main className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-6 print:pb-0">
        {/* the sidebar and header stay while a page's code is fetched */}
        <Suspense fallback={<PageLoader />}>
          <Outlet context={{ biz, setBiz, reload, labels, refreshAuth: refresh, version, bump, desk, setUnread, loadUnread }} />
        </Suspense>
      </main>

      {/* bottom tab bar (phone) */}
      <nav className="glass fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex justify-around rounded-full p-1.5 lg:hidden print:hidden">
        {[nav[0], nav[1], nav[3], nav.find((n) => n[0] === 'notifications')].map(([to, Icon, label, end, badge]) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx('relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-medium transition-colors', isActive ? 'bg-gold text-[#fff]' : 'text-paper/65')
            }
          >
            <Icon width={18} height={18} />
            <span className="max-w-full truncate px-1">{label}</span>
            {badge > 0 && <span className="absolute top-1 right-[calc(50%-18px)] size-2 rounded-full bg-coral" />}
          </NavLink>
        ))}
        <button type="button" onClick={() => setDrawer(true)} className="flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-medium text-paper/65">
          <Menu width={18} height={18} />
          <span>{t('menu.more')}</span>
        </button>
      </nav>

      {quickBook && (
        <AppointmentModal
          biz={biz}
          preset={{ date: today }}
          onClose={() => setQuickBook(false)}
          onSaved={() => {
            setQuickBook(false);
            toast(t('menu.booked'));
            bump();
          }}
        />
      )}
    </div>
  );
}

function SideMenu({ biz, nav, user, businesses, onLogout, onSwitch, onClose }) {
  const { t } = useI18n();
  const [switcher, setSwitcher] = useState(false);
  const TypeIcon = TYPE_ICONS[biz.type] ?? Calendar;
  const isOwner = biz.me.role === 'owner';
  const linkClass = ({ isActive }) =>
    cx(
      'flex h-10 items-center gap-3 rounded-[10px] px-3 text-ui font-medium transition-[background,color] duration-200',
      isActive ? 'bg-gold text-white shadow-sm' : 'text-paper/75 hover:bg-white/8 hover:text-paper',
    );

  return (
    <div className="flex h-full flex-col bg-ink-2 text-paper">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <Link to="/app" className="py-1">
          <Wordmark />
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-paper/70 hover:bg-white/10" aria-label={t('common.close')}>
            <Close width={18} height={18} />
          </button>
        )}
      </div>

      <div className="relative px-3">
        <button
          type="button"
          onClick={() => setSwitcher((s) => !s)}
          className="flex w-full items-center gap-3 rounded-[12px] border border-white/10 bg-white/[0.04] p-2.5 text-left transition-colors hover:border-white/25"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-light">
            <TypeIcon width={16} height={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-5 font-semibold">{biz.name}</span>
            <span className="block truncate text-[11px] leading-4 text-paper/50">{t(`types.${biz.type}`)}</span>
          </span>
          <ChevronDown width={15} height={15} className={cx('text-paper/50 transition-transform', switcher && 'rotate-180')} />
        </button>
        {switcher && (
          <div className="glass-strong absolute inset-x-3 top-full z-10 mt-2 animate-pop rounded-[14px] p-1.5">
            {businesses.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setSwitcher(false);
                  onSwitch(b.id);
                }}
                className={cx('block w-full truncate rounded-[10px] px-3 py-2 text-left text-ui hover:bg-white/8', b.id === biz.id && 'text-gold-light')}
              >
                {b.name}
              </button>
            ))}
            {isOwner && (
              <Link to="/onboarding" className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-ui text-paper/70 hover:bg-white/8">
                <Plus width={14} height={14} /> {t('nav.newBusiness')}
              </Link>
            )}
          </div>
        )}
      </div>

      <nav className="thin-scroll mt-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {nav.map(([to, Icon, label, end, badge]) => (
          <NavLink key={to} to={to} end={end} className={linkClass}>
            <Icon width={18} height={18} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {badge > 0 && <span className="rounded-full bg-coral px-1.5 text-[10px] leading-[18px] font-bold text-[#fff]">{badge > 99 ? '99+' : badge}</span>}
          </NavLink>
        ))}
        <a href={`/b/${biz.slug}`} target="_blank" rel="noreferrer" className={linkClass({ isActive: false })}>
          <ArrowUpRight width={18} height={18} /> {t('nav.publicPage')}
        </a>
      </nav>

      <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-[12px] font-semibold">{initials(user.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{user.name}</div>
          <div className="truncate text-[11px] text-paper/50">{isOwner ? t('menu.owner') : t('nav.staffBadge')}</div>
        </div>
        <LangSwitch className="px-1.5 sm:hidden" />
        <button type="button" onClick={onLogout} className="grid size-9 place-items-center rounded-full text-paper/60 hover:bg-white/10 hover:text-paper" title={t('nav.logout')} aria-label={t('nav.logout')}>
          <Logout width={17} height={17} />
        </button>
      </div>
    </div>
  );
}

/** Top bar search: Enter opens the search page with the words typed. */
function TopSearch({ biz }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      className="relative ml-2 hidden w-full max-w-[380px] md:block"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/app/${biz.id}/search?q=${encodeURIComponent(q.trim())}`);
        setQ('');
      }}
    >
      <Search width={16} height={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 opacity-70" />
      <input
        className="h-9 w-full rounded-full border border-white/20 bg-white/10 pr-3 pl-9 text-[13px] text-inherit outline-none placeholder:text-current placeholder:opacity-60 focus:border-white/45 focus:bg-white/15"
        placeholder={t('menu.searchPlaceholder')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={t('menu.search')}
      />
    </form>
  );
}

function UserMenu({ user, onLogout }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ml-1 grid size-9 place-items-center rounded-full bg-white/20 text-[12px] font-bold hover:bg-white/30"
        aria-label={t('menu.account')}
      >
        {initials(user.name)}
      </button>
      {open && (
        <div className="topbar-pop glass-strong absolute top-full right-0 z-50 mt-2 w-56 animate-pop rounded-[14px] p-1.5 text-paper">
          <div className="px-3 py-2">
            <div className="truncate text-[13px] font-semibold">{user.name}</div>
            <div className="truncate text-[11px] text-paper/50">{user.email}</div>
          </div>
          <Link to="account" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-ui hover:bg-white/8">
            <User width={15} height={15} /> {t('menu.account')}
          </Link>
          <Link to="support" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-ui hover:bg-white/8">
            <Help width={15} height={15} /> {t('menu.support')}
          </Link>
          <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-ui text-danger hover:bg-white/8">
            <Logout width={15} height={15} /> {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
