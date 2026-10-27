import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  createWorkshopSupplier,
  deleteWorkshopSupplier,
  getWorkshopSuppliers,
  updateWorkshopSupplier,
  type WorkshopSupplier,
  type WorkshopSupplierWriteInput,
} from '../services/apiService';
import {
  formatSupplierDocument,
  supplierDisplayName,
} from '../utils/workshopSuppliers';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import {
  iosModalClose,
  iosModalShell,
  resolveIosModalOverlayClass,
  NESTED_STOCK_OVERLAY_Z,
} from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type WorkshopSuppliersModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const emptyForm = (): WorkshopSupplierWriteInput => ({
  name: '',
  trade_name: '',
  document: '',
  email: '',
  phone: '',
  whatsapp: '',
  contact_name: '',
  address_street: '',
  address_number: '',
  address_complement: '',
  address_neighborhood: '',
  address_city: '',
  address_state: '',
  address_zip: '',
  notes: '',
  active: true,
});

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className ?? ''}`}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[14px] text-zinc-900 outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/20 dark:text-white';

export function WorkshopSuppliersModal({ isOpen, onClose }: WorkshopSuppliersModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [items, setItems] = useState<WorkshopSupplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkshopSupplierWriteInput>(emptyForm);
  const [showInactive, setShowInactive] = useState(false);

  useBrowserBackLayer(isOpen, onClose);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getWorkshopSuppliers({
        activeOnly: !showInactive,
      });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar fornecedores.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setEditingId(null);
    setForm(emptyForm());
    void load();
  }, [isOpen, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    if (!q) return items;
    return items.filter((s) =>
      [
        s.name,
        s.trade_name,
        s.document,
        s.email,
        s.phone,
        s.whatsapp,
        s.contact_name,
        s.address_city,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(q)
    );
  }, [items, query]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const startEdit = (s: WorkshopSupplier) => {
    setEditingId(s.id);
    setForm({
      name: s.name || '',
      trade_name: s.trade_name || '',
      document: formatSupplierDocument(s.document) || s.document || '',
      email: s.email || '',
      phone: s.phone || '',
      whatsapp: s.whatsapp || '',
      contact_name: s.contact_name || '',
      address_street: s.address_street || '',
      address_number: s.address_number || '',
      address_complement: s.address_complement || '',
      address_neighborhood: s.address_neighborhood || '',
      address_city: s.address_city || '',
      address_state: s.address_state || '',
      address_zip: s.address_zip || '',
      notes: s.notes || '',
      active: s.active !== false,
    });
  };

  const patchForm = (partial: Partial<WorkshopSupplierWriteInput>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const handleSave = async () => {
    if (!String(form.name || '').trim()) {
      setError('Informe o nome do fornecedor.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateWorkshopSupplier(editingId, form);
      } else {
        await createWorkshopSupplier(form);
      }
      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar fornecedor.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (s: WorkshopSupplier) => {
    if (!window.confirm(`Desativar o fornecedor "${supplierDisplayName(s)}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteWorkshopSupplier(s.id);
      if (editingId === s.id) {
        setEditingId(null);
        setForm(emptyForm());
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao desativar.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);

  return (
    <RegistrationPortal>
      <div className={overlayClass} onClick={onClose} role="presentation">
        <div
          className={`${iosModalShell} flex h-[min(96dvh,920px)] w-full max-w-5xl flex-col overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Fornecedores"
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/60 px-5 pb-3 pt-8 pr-24 dark:border-white/[0.06] sm:px-6">
            <IosModalHeader
              icon={<Building2 className="h-5 w-5 text-zinc-800" />}
              title="Fornecedores"
              subtitle="Cadastro completo para compras e NF-e do estoque"
              gradientClass="from-emerald-500 to-teal-700"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto border-b border-zinc-200/60 px-5 py-4 custom-scrollbar dark:border-white/[0.06] lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar nome, CNPJ, cidade…"
                    className="w-full rounded-xl border-0 bg-zinc-100 py-2.5 pl-9 pr-3 text-[14px] outline-none dark:bg-white/5 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={startCreate}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-500"
                >
                  <Plus className="h-4 w-4" />
                  Novo
                </button>
              </div>

              <label className="flex items-center gap-2 text-[12px] text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                Incluir desativados
              </label>

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando…
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-zinc-500">
                  Nenhum fornecedor encontrado.
                </p>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((s) => {
                    const active = editingId === s.id;
                    return (
                      <li key={s.id}>
                        <div
                          className={`rounded-2xl px-3.5 py-3 ${
                            active
                              ? 'bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800'
                              : 'bg-zinc-50 dark:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(s)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">
                                {supplierDisplayName(s)}
                                {s.active === false ? (
                                  <span className="ml-2 text-[11px] font-bold uppercase text-amber-700">
                                    Inativo
                                  </span>
                                ) : null}
                              </p>
                              <p className="mt-0.5 text-[12px] text-zinc-500">
                                {[
                                  formatSupplierDocument(s.document) || null,
                                  s.contact_name,
                                  s.phone || s.whatsapp,
                                  [s.address_city, s.address_state].filter(Boolean).join('/'),
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'Sem detalhes'}
                              </p>
                            </button>
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(s)}
                                className="rounded-lg p-2 text-zinc-500 hover:bg-white dark:hover:bg-white/10"
                                aria-label="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {s.active !== false ? (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void handleDeactivate(s)}
                                  className="rounded-lg p-2 text-red-600 hover:bg-red-500/10 disabled:opacity-40"
                                  aria-label="Desativar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 custom-scrollbar sm:px-6">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">
                  {editingId ? 'Editar fornecedor' : 'Novo fornecedor'}
                </p>
                {editingId ? (
                  <button
                    type="button"
                    onClick={startCreate}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-zinc-500 hover:text-zinc-800"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Novo
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Razão social / nome" className="sm:col-span-2">
                  <input
                    className={inputClass}
                    value={form.name || ''}
                    onChange={(e) => patchForm({ name: e.target.value })}
                    placeholder="Obrigatório"
                  />
                </Field>
                <Field label="Nome fantasia">
                  <input
                    className={inputClass}
                    value={form.trade_name || ''}
                    onChange={(e) => patchForm({ trade_name: e.target.value })}
                  />
                </Field>
                <Field label="CNPJ / CPF">
                  <input
                    className={inputClass}
                    value={form.document || ''}
                    onChange={(e) => patchForm({ document: e.target.value })}
                    placeholder="00.000.000/0000-00"
                  />
                </Field>
                <Field label="Contato">
                  <input
                    className={inputClass}
                    value={form.contact_name || ''}
                    onChange={(e) => patchForm({ contact_name: e.target.value })}
                  />
                </Field>
                <Field label="E-mail">
                  <input
                    type="email"
                    className={inputClass}
                    value={form.email || ''}
                    onChange={(e) => patchForm({ email: e.target.value })}
                  />
                </Field>
                <Field label="Telefone">
                  <input
                    className={inputClass}
                    value={form.phone || ''}
                    onChange={(e) => patchForm({ phone: e.target.value })}
                  />
                </Field>
                <Field label="WhatsApp">
                  <input
                    className={inputClass}
                    value={form.whatsapp || ''}
                    onChange={(e) => patchForm({ whatsapp: e.target.value })}
                  />
                </Field>
                <Field label="CEP">
                  <input
                    className={inputClass}
                    value={form.address_zip || ''}
                    onChange={(e) => patchForm({ address_zip: e.target.value })}
                  />
                </Field>
                <Field label="Rua / logradouro" className="sm:col-span-2">
                  <input
                    className={inputClass}
                    value={form.address_street || ''}
                    onChange={(e) => patchForm({ address_street: e.target.value })}
                  />
                </Field>
                <Field label="Número">
                  <input
                    className={inputClass}
                    value={form.address_number || ''}
                    onChange={(e) => patchForm({ address_number: e.target.value })}
                  />
                </Field>
                <Field label="Complemento">
                  <input
                    className={inputClass}
                    value={form.address_complement || ''}
                    onChange={(e) => patchForm({ address_complement: e.target.value })}
                  />
                </Field>
                <Field label="Bairro">
                  <input
                    className={inputClass}
                    value={form.address_neighborhood || ''}
                    onChange={(e) => patchForm({ address_neighborhood: e.target.value })}
                  />
                </Field>
                <Field label="Cidade">
                  <input
                    className={inputClass}
                    value={form.address_city || ''}
                    onChange={(e) => patchForm({ address_city: e.target.value })}
                  />
                </Field>
                <Field label="UF">
                  <input
                    className={inputClass}
                    value={form.address_state || ''}
                    maxLength={2}
                    onChange={(e) => patchForm({ address_state: e.target.value.toUpperCase() })}
                    placeholder="SP"
                  />
                </Field>
                <Field label="Observações" className="sm:col-span-2">
                  <textarea
                    rows={3}
                    className={`${inputClass} resize-none`}
                    value={form.notes || ''}
                    onChange={(e) => patchForm({ notes: e.target.value })}
                  />
                </Field>
              </div>

              {editingId ? (
                <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={form.active !== false}
                    onChange={(e) => patchForm({ active: e.target.checked })}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  Fornecedor ativo
                </label>
              ) : null}

              {error ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[15px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Building2 className="h-5 w-5" />}
                {editingId ? 'Salvar alterações' : 'Cadastrar fornecedor'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </RegistrationPortal>
  );
}
