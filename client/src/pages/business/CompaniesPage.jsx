import { useEffect, useState } from 'react';
import { Link, Navigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Page, PageHead, useApi } from '../../components/clinic.jsx';
import { Button, Empty, ErrorNote, Field, LoadLine, Modal, Toggle, cx } from '../../components/ui.jsx';
import { Building, Mail, Phone, Plus, Search, Trash, Users } from '../../components/icons.jsx';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useToast } from '../../lib/toast.jsx';

const EMPTY = { name: '', taxId: '', contact: '', phone: '', email: '', address: '', discount: 0, notes: '', active: true };

export default function CompaniesPage() {
  const { biz, labels, desk, version } = useOutletContext();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = useApi(desk ? `/businesses/${biz.id}/companies` : null, [version]);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  // ?open=<id> (from search) opens that company
  useEffect(() => {
    const id = Number(params.get('open'));
    const c = id && data?.find((x) => x.id === id);
    if (!c) return;
    setEditing(c);
    setParams({}, { replace: true });
  }, [data, params, setParams]);

  if (!desk) return <Navigate to=".." relative="path" replace />;
  const needle = q.trim().toLowerCase();
  const rows = (data ?? []).filter((c) => !needle || [c.name, c.taxId, c.contact].some((v) => v?.toLowerCase().includes(needle)));

  return (
    <Page>
      <PageHead title={t('menu.companies')} sub={t('comp.lead')}>
        <Button variant="gold" onClick={() => setEditing({ ...EMPTY })}>
          <Plus width={16} height={16} /> {t('comp.add')}
        </Button>
      </PageHead>
      {data?.length > 6 && (
        <label className="relative mt-4 block max-w-[380px]">
          <Search width={16} height={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-paper/40" />
          <input className="input pl-9" placeholder={t('comp.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      )}
      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <div className="mt-5">
        {!data ? (
          <LoadLine />
        ) : rows.length === 0 ? (
          <Empty icon={Building}>{t('comp.empty')}</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((c) => (
              <article key={c.id} className={cx('card flex flex-col gap-3 p-4', !c.active && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-gold/15 text-gold-light">
                    <Building width={20} height={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => setEditing(c)} className="block truncate text-left text-[15px] font-semibold hover:underline">
                      {c.name}
                    </button>
                    <div className="truncate text-[12px] text-paper/50">{[c.taxId, !c.active && t('comp.inactive')].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  {c.discount > 0 && <span className="shrink-0 rounded-full bg-ready/15 px-2.5 py-1 text-[12px] font-bold text-ready">-{c.discount}%</span>}
                </div>
                <div className="flex flex-col gap-1 text-[12px] text-paper/65">
                  {c.contact && <span>{c.contact}</span>}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:text-paper">
                      <Phone width={13} height={13} /> {c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-paper">
                      <Mail width={13} height={13} /> {c.email}
                    </a>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-white/8 pt-3">
                  <Link to={`../patients?companyId=${c.id}`} relative="path" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gold-light hover:underline">
                    <Users width={14} height={14} /> {t('comp.patientsN', { n: c.patients, clients: labels.clients.toLowerCase() })}
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                    {t('common.edit')}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {editing && (
        <CompanyModal
          biz={biz}
          company={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </Page>
  );
}

function CompanyModal({ biz, company, onClose, onSaved }) {
  const { t, tErr } = useI18n();
  const toast = useToast();
  const [d, setD] = useState(company);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = !company.id;
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...d, discount: Number(d.discount) || 0 };
      if (isNew) await api(`/businesses/${biz.id}/companies`, { method: 'POST', body });
      else await api(`/businesses/${biz.id}/companies/${company.id}`, { method: 'PATCH', body });
      toast(t('settings.saved'));
      onSaved();
    } catch (err) {
      setError(tErr(err));
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(t('comp.deleteConfirm', { name: company.name }))) return;
    try {
      await api(`/businesses/${biz.id}/companies/${company.id}`, { method: 'DELETE' });
      onSaved();
    } catch (err) {
      setError(tErr(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t('comp.add') : company.name}
      footer={
        <>
          {!isNew && biz.me.role === 'owner' && (
            <Button variant="danger" size="sm" onClick={remove} className="mr-auto">
              <Trash width={14} height={14} /> {t('common.delete')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !d.name.trim()}>
            {t('settings.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('comp.name')} className="sm:col-span-2">
            <input className="input" autoFocus required maxLength={160} value={d.name} onChange={set('name')} />
          </Field>
          <Field label={t('comp.taxId')} optional>
            <input className="input" maxLength={40} value={d.taxId} onChange={set('taxId')} />
          </Field>
          <Field label={t('comp.discount')} hint={t('comp.discountHint')}>
            <input className="input" type="number" min={0} max={100} step={1} value={d.discount} onChange={set('discount')} />
          </Field>
          <Field label={t('comp.contact')} optional>
            <input className="input" maxLength={120} value={d.contact} onChange={set('contact')} />
          </Field>
          <Field label={t('appt.phone')} optional>
            <input className="input" type="tel" maxLength={40} value={d.phone} onChange={set('phone')} />
          </Field>
          <Field label={t('appt.email')} optional className="sm:col-span-2">
            <input className="input" type="email" maxLength={160} value={d.email} onChange={set('email')} />
          </Field>
          <Field label={t('pat.address')} optional className="sm:col-span-2">
            <input className="input" maxLength={300} value={d.address} onChange={set('address')} />
          </Field>
          <Field label={t('pat.notes')} optional className="sm:col-span-2">
            <textarea className="input" maxLength={2000} value={d.notes} onChange={set('notes')} />
          </Field>
        </div>
        <Toggle checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t('comp.active')} description={t('comp.activeHint')} />
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
