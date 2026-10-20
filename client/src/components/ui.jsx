import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { Close } from './icons.jsx';

export const cx = (...c) => c.filter(Boolean).join(' ');

/* ───────── buttons (ONE: primary paper, gold, glass, outline; plus ghost & danger) ───────── */

export const buttonClass = (variant = 'glass', size = 'md', className) =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none transition-[background,color,border-color,transform,opacity] duration-300 ease-out-expo active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
    size === 'sm' && 'h-8 px-3.5 text-[12px]',
    size === 'md' && 'h-10 px-5 text-ui',
    size === 'lg' && 'h-12 px-6 text-[14px]',
    variant === 'primary' && 'bg-paper text-ink hover:bg-white',
    variant === 'gold' && 'bg-gold text-ink hover:bg-gold-light',
    variant === 'glass' && 'glass text-paper hover:bg-white/15',
    variant === 'outline' && 'border border-white/20 text-paper hover:border-white/50 hover:bg-white/5',
    variant === 'ghost' && 'text-paper/75 hover:bg-white/10 hover:text-paper',
    variant === 'danger' && 'border border-ember/40 text-danger hover:bg-ember/10 hover:border-ember/70',
    className,
  );

export function Button({ className, variant = 'glass', size = 'md', type = 'button', ...p }) {
  return <button type={type} {...p} className={buttonClass(variant, size, className)} />;
}

export function IconButton({ className, active, size = 'md', label, ...p }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...p}
      className={cx(
        'glass grid shrink-0 place-items-center rounded-full text-paper transition-[background,color,transform,opacity] duration-300 ease-out-expo hover:bg-white/15 active:scale-95 disabled:pointer-events-none disabled:opacity-35',
        size === 'sm' && 'size-8',
        size === 'md' && 'size-10',
        size === 'lg' && 'size-12',
        active && '!bg-paper !text-ink',
        className,
      )}
    />
  );
}

/** Filter chip — sits inside a glass pill track (ChipGroup). */
export function Chip({ active, icon, children, className, color, ...p }) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      {...p}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-ui font-medium whitespace-nowrap transition-[background,color] duration-300',
        active ? 'bg-paper text-ink' : 'text-paper/80 hover:bg-white/10 hover:text-paper',
        className,
      )}
    >
      {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
      {icon}
      {children}
    </button>
  );
}

export function ChipGroup({ children, className }) {
  return <div className={cx('glass no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full p-1', className)}>{children}</div>;
}

/* ───────── status ───────── */

const STATUS_COLOR = {
  confirmed: 'bg-ready',
  pending: 'bg-building',
  completed: 'bg-pipeline',
  cancelled: 'bg-mute',
  no_show: 'bg-coral',
};

export function StatusDot({ status, pulse }) {
  const c = STATUS_COLOR[status] ?? 'bg-mute';
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {pulse && <span className={cx('absolute inset-0 animate-pulse-ring rounded-full', c)} />}
      <span className={cx('relative size-2 rounded-full', c)} />
    </span>
  );
}

export function StatusBadge({ status, className }) {
  const { t } = useI18n();
  return (
    <span className={cx('inline-flex h-7 items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 text-[12px] font-medium whitespace-nowrap text-paper/90', className)}>
      <StatusDot status={status} pulse={status === 'pending'} />
      {t(`status.${status}`)}
    </span>
  );
}

export function Stat({ value, label }) {
  return (
    <div className="min-w-0">
      <div className="text-[28px] leading-none font-light tracking-[-0.02em] tabular-nums text-paper">{value}</div>
      <div className="mt-2 text-[12px] leading-4 text-paper/55">{label}</div>
    </div>
  );
}

export function Eyebrow({ children, className }) {
  return <div className={cx('eyebrow text-gold', className)}>{children}</div>;
}

/** Names set the ONE way: a light word followed by a bold one. */
export function SplitName({ light, bold, className }) {
  return (
    <span className={className}>
      {light && <span className="font-light">{light} </span>}
      <span className="font-semibold">{bold}</span>
    </span>
  );
}

export function Wordmark({ className }) {
  return (
    <span className={cx('inline-flex items-center gap-2 text-[17px] tracking-[-0.02em]', className)}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect x="5" y="6.5" width="22" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M5 12.5h22M11 3.5v5M21 3.5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="19.5" r="2.6" fill="var(--color-gold)" />
      </svg>
      <span>
        <span className="font-light">Pro</span>
        <span className="font-semibold">gramo</span>
      </span>
    </span>
  );
}

/* ───────── forms ───────── */

export function Field({ label, hint, children, className, optional }) {
  const { t } = useI18n();
  return (
    <label className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <span className="text-[12px] font-medium text-paper/65">
          {label}
          {optional && <span className="font-normal text-paper/35"> · {t('common.optional')}</span>}
        </span>
      )}
      {children}
      {hint && <span className="text-[11px] leading-4 text-paper/40">{hint}</span>}
    </label>
  );
}

/** "9" → 09:00, "930" → 09:30, "9:5" → 09:05; null when it isn't a time. */
export function parseTime(s) {
  const digits = String(s ?? '').replace(/\D/g, '');
  if (!digits) return null;
  let h, m;
  if (String(s).includes(':')) [h, m = 0] = String(s).split(':').map(Number);
  else if (digits.length <= 2) [h, m] = [Number(digits), 0];
  else [h, m] = [Number(digits.slice(0, -2)), Number(digits.slice(-2))];
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Always-24h time field. Native <input type="time"> follows the browser's
 * locale (AM/PM on English systems), not the language chosen in the app.
 */
export function TimeInput({ value, onChange, className, ...p }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  return (
    <input
      {...p}
      className={cx('input tabular-nums', className)}
      inputMode="numeric"
      placeholder="09:00"
      maxLength={5}
      value={draft}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d:]/g, '');
        setDraft(v);
        if (/^\d{2}:\d{2}$/.test(v) && parseTime(v)) onChange(v);
      }}
      onBlur={() => {
        const n = parseTime(draft);
        setDraft(n ?? value ?? '');
        if (n && n !== value) onChange(n);
      }}
    />
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3 py-1', disabled && 'pointer-events-none opacity-40')}>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-10 rounded-full border border-white/16 bg-white/8 transition-colors duration-300 peer-checked:border-gold peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold/40" />
        <span className="absolute top-1 left-1 size-4 rounded-full bg-paper transition-transform duration-300 ease-out-expo peer-checked:translate-x-4 peer-checked:bg-ink" />
      </span>
      {(label || description) && (
        <span className="min-w-0">
          <span className="block text-[14px] leading-6">{label}</span>
          {description && <span className="block text-[12px] leading-4 text-paper/50">{description}</span>}
        </span>
      )}
    </label>
  );
}

/** Segmented control in a glass track — same look as a ChipGroup. */
export function Segmented({ value, onChange, options, className }) {
  return (
    <ChipGroup className={className}>
      {options.map((o) => (
        <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)} icon={o.icon}>
          {o.label}
        </Chip>
      ))}
    </ChipGroup>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <div className="rounded-[12px] border border-ember/35 bg-ember/10 px-3.5 py-2.5 text-[13px] leading-5 text-danger">{children}</div>;
}

export function LoadLine({ className }) {
  return (
    <div className={cx('h-px w-full overflow-hidden bg-white/10', className)}>
      <div className="h-full w-full animate-load-line bg-gold" />
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50dvh] place-items-center">
      <LoadLine className="max-w-[160px]" />
    </div>
  );
}

export function Empty({ icon: Icon, children }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-white/12 px-6 py-14 text-center text-ui text-paper/50">
      {Icon && <Icon width={28} height={28} className="text-paper/30" />}
      {children}
    </div>
  );
}

export function LangSwitch({ className }) {
  const { lang, setLang, t } = useI18n();
  const other = lang === 'en' ? 'ro' : 'en';
  return (
    <button
      type="button"
      onClick={() => setLang(other)}
      aria-label={t('language')}
      className={cx('rounded-full px-3 py-2 text-ui font-semibold tracking-wide transition-colors hover:bg-white/10', className)}
    >
      {lang.toUpperCase()}
      <span className="text-paper/35"> / {other.toUpperCase()}</span>
    </button>
  );
}

/* ───────── modal (glass-strong sheet; bottom sheet on phones) ───────── */

export function Modal({ open, onClose, title, eyebrow, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className={cx(
          'glass-strong relative flex max-h-[92dvh] w-full animate-pop flex-col overflow-hidden rounded-t-[24px] outline-none sm:rounded-[24px]',
          wide ? 'sm:max-w-[760px]' : 'sm:max-w-[520px]',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 sm:px-6">
          <div className="min-w-0">
            {eyebrow && <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>}
            <h2 className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">{title}</h2>
          </div>
          <IconButton size="sm" label="Close" onClick={onClose}>
            <Close width={16} height={16} />
          </IconButton>
        </div>
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/8 px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

/** Tiny transient notice in the corner. */
export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex justify-center px-4">
      <div className="glass animate-pop rounded-full px-5 py-2.5 text-ui font-medium">{message}</div>
    </div>
  );
}
