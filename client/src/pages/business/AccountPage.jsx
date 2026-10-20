import { Page, PageHead, Panel } from '../../components/clinic.jsx';
import { cx } from '../../components/ui.jsx';
import { Check, Moon, Sun } from '../../components/icons.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useTheme } from '../../lib/theme.jsx';
import { Account } from './SettingsPage.jsx';
import SecurityPanel from './SecurityPanel.jsx';

/** "Contul meu": profile, password, language and the light / dark look. */
export default function AccountPage() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const looks = [
    { id: 'light', icon: Sun, bg: '#eef3f4', side: '#2e3f45', bar: '#12a39a', card: '#ffffff', text: '#1d2c32' },
    { id: 'dark', icon: Moon, bg: '#101010', side: '#151515', bar: '#1c1c20', card: '#1a1a1e', text: '#f2efe9', accent: '#c9a96e' },
  ];
  return (
    <Page className="max-w-[1000px]">
      <PageHead title={t('menu.account')} sub={t('acct.lead')} />
      <div className="mt-5 flex flex-col gap-5">
        <Panel title={t('acct.lookTitle')}>
          <div className="grid gap-3 sm:grid-cols-2">
            {looks.map((l) => {
              const Icon = l.icon;
              const on = theme === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setTheme(l.id)}
                  aria-pressed={on}
                  className={cx('rounded-[14px] border-2 p-2 text-left transition-colors', on ? 'border-gold' : 'border-white/10 hover:border-white/30')}
                >
                  {/* miniature of the app in that look */}
                  <div className="flex h-28 overflow-hidden rounded-[10px]" style={{ background: l.bg }} aria-hidden>
                    <div className="w-1/5" style={{ background: l.side }} />
                    <div className="flex flex-1 flex-col">
                      <div className="h-4" style={{ background: l.bar }} />
                      <div className="grid flex-1 grid-cols-3 gap-1.5 p-2">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="rounded-[4px]" style={{ background: l.id === 'light' ? l.bar : l.card, border: l.id === 'dark' ? '1px solid #ffffff14' : 0 }}>
                            <div className="m-1.5 h-1.5 w-2/3 rounded-full" style={{ background: l.id === 'light' ? '#ffffff' : l.accent }} />
                          </div>
                        ))}
                        <div className="col-span-3 rounded-[4px]" style={{ background: l.card }} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 px-1">
                    <Icon width={16} height={16} />
                    <span className="flex-1 text-ui font-semibold">{t(`acct.looks.${l.id}`)}</span>
                    {on && <Check width={16} height={16} className="text-gold-light" />}
                  </div>
                  <p className="px-1 text-[12px] text-paper/55">{t(`acct.looks.${l.id}Hint`)}</p>
                </button>
              );
            })}
          </div>
        </Panel>
        <div>
          <h2 className="mb-2 px-1 text-[14px] font-semibold">{t('acct.profileTitle')}</h2>
          <Account />
        </div>
        <SecurityPanel />
      </div>
    </Page>
  );
}
