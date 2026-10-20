import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { homeFor, useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { LangSwitch, Wordmark, cx } from './ui.jsx';

/** Header for content pages: transparent at the top, dark glass once the page scrolls (ONE SiteHeader). */
export default function SiteHeader() {
  const { t } = useI18n();
  const { user, businesses, logout } = useAuth();
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const f = () => setSolid(window.scrollY > 40);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:p-4 md:pt-[calc(1rem+env(safe-area-inset-top))]">
      <div
        className={cx(
          'mx-auto flex h-14 max-w-[1400px] items-center justify-between rounded-[16px] pr-2 pl-5 transition-[background,border-color,box-shadow,backdrop-filter] duration-500',
          solid ? 'glass' : 'border border-transparent',
        )}
      >
        <Link to="/" className="text-paper">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 text-ui">
          {user ? (
            <>
              <Link to={homeFor(user, businesses)} className="rounded-full bg-paper px-4 py-2 font-medium text-ink transition-colors hover:bg-white">
                {user.role === 'client' ? t('nav.myAppointments') : t('nav.dashboard')}
              </Link>
              <button type="button" onClick={logout} className="hidden rounded-full px-3.5 py-2 text-paper/75 transition-colors hover:bg-white/10 hover:text-paper sm:block">
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-full px-3.5 py-2 text-paper/75 transition-colors hover:bg-white/10 hover:text-paper">
                {t('nav.login')}
              </Link>
              <Link to="/register" className="rounded-full bg-paper px-4 py-2 font-medium text-ink transition-colors hover:bg-white">
                {t('nav.register')}
              </Link>
            </>
          )}
          <LangSwitch className="ml-1" />
        </nav>
      </div>
    </header>
  );
}
