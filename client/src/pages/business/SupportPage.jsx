import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Page, PageHead, Panel } from '../../components/clinic.jsx';
import { Button, cx } from '../../components/ui.jsx';
import { Calendar, ChevronDown, Copy, Folder, Help, Mail, Message, Shield, Wallet } from '../../components/icons.jsx';
import { copyText } from '../../lib/device.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';

// Set VITE_SUPPORT_EMAIL when building to show a contact address on this page.
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || '';
const FAQ = ['book', 'patient', 'pay', 'remind', 'online', 'staff', 'discount', 'export', 'theme', 'phone'];
const GUIDE = [
  ['calendar', Calendar, 'calendar'],
  ['patients', Folder, 'patients'],
  ['cashier', Wallet, 'cashier'],
  ['messages', Message, 'messages'],
];

export default function SupportPage() {
  const { biz } = useOutletContext();
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(FAQ[0]);

  const info = [`Programo ${__APP_VERSION__}`, `${biz.name} (#${biz.id})`, navigator.userAgent, new Date().toISOString()].join('\n');
  const copy = async () => {
    if (await copyText(info)) toast(t('support.copied'));
    else window.prompt(t('support.copyManual'), info);
  };

  return (
    <Page className="max-w-[1100px]">
      <PageHead title={t('menu.support')} sub={t('support.lead')} />
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Panel title={t('support.guideTitle')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {GUIDE.map(([k, Icon, to]) => (
                <Link key={k} to={`../${to}`} relative="path" className="flex gap-3 rounded-[12px] border border-white/8 p-3 transition-colors hover:border-gold/50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold-light">
                    <Icon width={18} height={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-ui font-semibold">{t(`support.guide.${k}.title`)}</span>
                    <span className="block text-[12px] leading-5 text-paper/60">{t(`support.guide.${k}.text`)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Panel>
          <Panel title={t('support.faqTitle')} bodyClass="p-0">
            <ul className="divide-y divide-white/8">
              {FAQ.map((k) => (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => setOpen(open === k ? null : k)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-ui font-medium hover:bg-white/[0.03]"
                    aria-expanded={open === k}
                  >
                    {t(`support.faq.${k}.q`)}
                    <ChevronDown width={16} height={16} className={cx('shrink-0 text-paper/50 transition-transform', open === k && 'rotate-180')} />
                  </button>
                  {open === k && <p className="px-4 pb-4 text-ui leading-6 text-paper/70">{t(`support.faq.${k}.a`)}</p>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title={t('support.contactTitle')}>
            <div className="flex flex-col gap-3 text-ui text-paper/70">
              <p>{t('support.contactLead')}</p>
              {SUPPORT_EMAIL && (
                <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Programo · ${biz.name}`)}`} className="inline-flex items-center gap-2 font-medium text-gold-light hover:underline">
                  <Mail width={16} height={16} /> {SUPPORT_EMAIL}
                </a>
              )}
              <Button variant="outline" size="sm" onClick={copy}>
                <Copy width={14} height={14} /> {t('support.copyInfo')}
              </Button>
            </div>
          </Panel>
          <Panel title={t('support.safetyTitle')}>
            <ul className="flex flex-col gap-2 text-[12px] leading-5 text-paper/65">
              {['s1', 's2', 's3', 's4'].map((k) => (
                <li key={k} className="flex gap-2">
                  <Shield width={15} height={15} className="mt-0.5 shrink-0 text-gold-light" /> {t(`support.safety.${k}`)}
                </li>
              ))}
            </ul>
          </Panel>
          <p className="flex items-center gap-2 px-1 text-[11px] text-paper/40">
            <Help width={13} height={13} /> Programo {__APP_VERSION__}
          </p>
        </div>
      </div>
    </Page>
  );
}
