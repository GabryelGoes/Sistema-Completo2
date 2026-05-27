import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Loader2,
  Camera,
  Copy,
  MessageCircle,
  Trash2,
  MapPin,
  Search,
  Save,
  RefreshCw,
  Archive,
  CarFront,
} from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { desktopShellViewportOverlayClass } from '../utils/desktopShellOverlay';
import type { PlacaFipeLookupResult, ServiceOrderListItem, VehicleAccompanimentPhoto } from '../services/apiService';
import {
  bootstrapVehicleAccompaniment,
  consultPlacaFipe,
  getServiceOrderBudgets,
  getServiceOrders,
  getVehicleAccompanimentByOrder,
  putVehicleAccompaniment,
  uploadServiceOrderPhoto,
  type SavedBudgetFromApi,
  type WorkshopVehicleAccompanimentRow,
} from '../services/apiService';
import { getVehiclePhotoPublicUrl } from '../utils/vehicleStoragePublicUrl';
import { getStageConfig, getStageStyle, isServiceOrderActivePatioFlow } from '../constants/serviceOrderStages';

const VAC_MODULE_ICON = '/icons/recepcao-ios.png';

const shell =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-zinc-900/45 backdrop-blur-2xl ' +
  'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.45)]';

/** OS em fluxo ativo no pátio (não cancelada). */
function isOrderActivePatio(o: ServiceOrderListItem): boolean {
  return o.status !== 'CANCELLED' && isServiceOrderActivePatioFlow(o.status);
}

function vehicleDisplayName(o: ServiceOrderListItem): string {
  const brand = (o.vehicle_brand ?? '').trim();
  const model = (o.vehicle_model ?? '').trim();
  const joined = [brand, model].filter(Boolean).join(' ').trim();
  return joined || model || 'Veículo sem nome';
}

function normalizePlate(s: string): string {
  return s.replace(/[\s-]/g, '').toLowerCase();
}

function orderMatchesQuery(o: ServiceOrderListItem, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const customer = (o.customer_name ?? o.customers?.name ?? '').toLowerCase();
  const vehicle = vehicleDisplayName(o).toLowerCase();
  const plateNorm = normalizePlate(o.plate ?? '');
  const qPlate = normalizePlate(q);
  if (customer.includes(q) || vehicle.includes(q)) return true;
  if (plateNorm && qPlate && plateNorm.includes(qPlate)) return true;
  return false;
}

/** Mais recentes primeiro (entrada na oficina / última atualização). */
const sortMostRecentFirst = (a: ServiceOrderListItem, b: ServiceOrderListItem) => {
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (tb !== ta) return tb - ta;
  const na = a.os_number ?? 0;
  const nb = b.os_number ?? 0;
  if (nb !== na) return nb - na;
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
};

/** Cartão com vidro, sombra em camadas e leve tinta (Central do atendimento). */
const vacCard =
  'relative overflow-hidden rounded-[16px] border border-white/55 dark:border-white/[0.09] ' +
  'bg-gradient-to-br from-white/95 via-white/[0.88] to-zinc-50/92 dark:from-zinc-900/88 dark:via-zinc-900/72 dark:to-zinc-950/92 backdrop-blur-2xl ' +
  'shadow-[0_1px_0_rgba(255,255,255,0.65)_inset,0_8px_32px_-8px_rgba(15,23,42,0.12),0_20px_48px_-16px_rgba(0,122,255,0.14),0_12px_36px_-12px_rgba(245,208,11,0.1)] ' +
  'dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_12px_40px_-10px_rgba(0,0,0,0.55),0_24px_56px_-20px_rgba(0,122,255,0.18)]';

const vacCardAccent =
  'pointer-events-none absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-[#007AFF] via-[#5AC8FA] to-brand-yellow opacity-90';

const vacSectionTitle =
  'text-[11px] font-bold uppercase tracking-[0.14em] bg-gradient-to-r from-[#007AFF] via-violet-500 to-amber-600 bg-clip-text text-transparent';

function budgetHasApproved(b: SavedBudgetFromApi): boolean {
  const sv = Array.isArray(b.services) ? b.services : [];
  const pt = Array.isArray(b.parts) ? b.parts : [];
  return sv.some((s) => s && s.approved === true) || pt.some((p) => p && p.approved === true);
}

function companionPublicUrl(shareToken: string): string {
  if (typeof window === 'undefined') return '';
  const path = `/acompanhamento/${encodeURIComponent(shareToken)}`;
  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return `${window.location.origin}${path}`;
  }
}

function waShareUrl(phoneRaw: string | null | undefined, message: string): string {
  const digits = (phoneRaw ?? '').replace(/\D/g, '');
  const text = encodeURIComponent(message);
  if (digits.length >= 10) {
    return `https://wa.me/${digits}?text=${text}`;
  }
  return `https://wa.me/?text=${text}`;
}

interface VehicleAccompanimentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Ao abrir o modal, pré-seleciona esta OS (ex.: vindo do Pátio). */
  initialServiceOrderId?: string | null;
}

export const VehicleAccompanimentModal: React.FC<VehicleAccompanimentModalProps> = ({
  isOpen,
  onClose,
  initialServiceOrderId = null,
}) => {
  const [orders, setOrders] = useState<ServiceOrderListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [acc, setAcc] = useState<WorkshopVehicleAccompanimentRow | null>(null);
  const [photos, setPhotos] = useState<VehicleAccompanimentPhoto[]>([]);
  const [observations, setObservations] = useState('');
  const [budgets, setBudgets] = useState<SavedBudgetFromApi[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [placaExtra, setPlacaExtra] = useState('');
  const [placaLookup, setPlacaLookup] = useState<PlacaFipeLookupResult | null>(null);
  const [placaLoading, setPlacaLoading] = useState(false);
  const [orderScope, setOrderScope] = useState<'patio' | 'arquivados'>('patio');
  const [listSearch, setListSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      setSelectedId(initialServiceOrderId ?? '');
      setListSearch('');
      setOrderScope('patio');
      wasOpenRef.current = true;
    }
  }, [isOpen, initialServiceOrderId]);

  const vehicleOrders = useMemo(
    () => orders.filter((o) => (o.order_type ?? 'vehicle') === 'vehicle'),
    [orders]
  );

  const scopeStats = useMemo(() => {
    const patio = vehicleOrders.filter(isOrderActivePatio);
    const arquivados = vehicleOrders.filter((o) => !isOrderActivePatio(o));
    return { patio: patio.length, arquivados: arquivados.length, total: vehicleOrders.length };
  }, [vehicleOrders]);

  const filteredOrdersForList = useMemo(() => {
    const scoped =
      orderScope === 'patio'
        ? vehicleOrders.filter(isOrderActivePatio)
        : vehicleOrders.filter((o) => !isOrderActivePatio(o));
    const searched = scoped.filter((o) => orderMatchesQuery(o, listSearch));
    return [...searched].sort(sortMostRecentFirst);
  }, [vehicleOrders, orderScope, listSearch]);

  useEffect(() => {
    if (!initialServiceOrderId || vehicleOrders.length === 0) return;
    const o = vehicleOrders.find((x) => x.id === initialServiceOrderId);
    if (o && !isOrderActivePatio(o)) setOrderScope('arquivados');
  }, [initialServiceOrderId, vehicleOrders]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId]
  );

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setError(null);
    try {
      const list = await getServiceOrders(undefined, 'vehicle');
      setOrders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao listar OS.');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadOrders();
  }, [isOpen, loadOrders]);

  const loadOrderContext = useCallback(async (serviceOrderId: string) => {
    setError(null);
    setPlacaLookup(null);
    setPlacaExtra('');
    try {
      let row = await getVehicleAccompanimentByOrder(serviceOrderId);
      if (!row) {
        row = await bootstrapVehicleAccompaniment(serviceOrderId);
      }
      setAcc(row);
      const rawPhotos = Array.isArray(row.intake_photos) ? row.intake_photos : [];
      setPhotos(
        rawPhotos.map((p, i) => ({
          id: typeof p.id === 'string' && p.id ? p.id : `ph_${i}`,
          path: typeof p.path === 'string' ? p.path : '',
          markers: Array.isArray(p.markers)
            ? p.markers
                .map((m: { id?: string; xPct?: number; yPct?: number; note?: string }, j: number) => ({
                  id: typeof m.id === 'string' && m.id ? m.id : `mk_${j}`,
                  xPct: Number(m.xPct),
                  yPct: Number(m.yPct),
                  note: typeof m.note === 'string' ? m.note : '',
                }))
                .filter((m) => Number.isFinite(m.xPct) && Number.isFinite(m.yPct))
            : [],
        }))
      );
      setObservations(typeof row.intake_observations === 'string' ? row.intake_observations : '');
      const b = await getServiceOrderBudgets(serviceOrderId);
      setBudgets(b.filter(budgetHasApproved));
    } catch (e) {
      setAcc(null);
      setPhotos([]);
      setBudgets([]);
      setError(e instanceof Error ? e.message : 'Erro ao carregar OS.');
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !selectedId) {
      setAcc(null);
      setPhotos([]);
      setObservations('');
      setBudgets([]);
      return;
    }
    void loadOrderContext(selectedId);
  }, [isOpen, selectedId, loadOrderContext]);

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedId) return;
    setUploading(true);
    setError(null);
    try {
      const up = await uploadServiceOrderPhoto(selectedId, file, file.name);
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ph_${Date.now()}`;
      setPhotos((prev) => [...prev, { id, path: up.path, markers: [] }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no envio da foto.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (id: string) => {
    if (!window.confirm('Remover esta foto da central?')) return;
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const onPhotoTap = (photoId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('[data-marker-pin]')) return;
    const note = window.prompt('Texto do marcador neste ponto (opcional)', '');
    if (note === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    const yPct = ((e.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
    const mid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `mk_${Date.now()}`;
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === photoId
          ? { ...p, markers: [...p.markers, { id: mid, xPct, yPct, note: note.trim() }] }
          : p
      )
    );
  };

  const removeMarker = (photoId: string, markerId: string) => {
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === photoId ? { ...p, markers: p.markers.filter((m) => m.id !== markerId) } : p
      )
    );
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const out = await putVehicleAccompaniment(selectedId, {
        intake_observations: observations,
        intake_photos: photos.filter((p) => p.path),
      });
      setAcc(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleConsultPlaca = async () => {
    const raw = (placaExtra || selectedOrder?.plate || '').trim().toUpperCase();
    if (raw.length < 7) {
      setError('Informe uma placa Mercosul (7 caracteres) para consultar.');
      return;
    }
    setPlacaLoading(true);
    setError(null);
    try {
      const r = await consultPlacaFipe(raw);
      setPlacaLookup(r);
    } catch (e) {
      setPlacaLookup(null);
      setError(e instanceof Error ? e.message : 'Falha na consulta.');
    } finally {
      setPlacaLoading(false);
    }
  };

  const copyLink = () => {
    if (!acc?.share_token) return;
    const url = companionPublicUrl(acc.share_token);
    void navigator.clipboard.writeText(url).catch(() => {});
  };

  const openWhatsApp = () => {
    if (!acc?.share_token) return;
    const url = companionPublicUrl(acc.share_token);
    const msg = `Acompanhe o serviço do seu veículo neste link:\n${url}`;
    window.open(waShareUrl(selectedOrder?.customers?.phone ?? null, msg), '_blank', 'noopener,noreferrer');
  };

  const isDesktopShell = useDesktopShellLayout();

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div
        className={`${desktopShellViewportOverlayClass(isDesktopShell, 'z-[140]')} flex flex-col bg-zinc-950/80 backdrop-blur-md dark:bg-black/85`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vac-title"
      >
        {/* Fundo no estilo Radar / Boletim */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-blue-400/30 blur-[100px] dark:bg-blue-500/20" />
          <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-sky-400/25 blur-[110px] dark:opacity-80" />
        </div>

        <div
          className={`relative flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden rounded-none border-0 bg-gradient-to-b from-zinc-50/95 via-light-page to-zinc-100/90 dark:from-zinc-950 dark:via-[#0a0c12] dark:to-black${isDesktopShell ? '' : ' h-[100dvh]'}`}
        >
          {isDesktopShell ? (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/80 bg-white/90 text-zinc-700 shadow-sm transition-all hover:bg-white dark:border-white/[0.1] dark:bg-zinc-800/90 dark:text-zinc-100"
              aria-label="Fechar central de atendimento"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}

          <div
            className={`flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))] [scrollbar-gutter:stable] ${isDesktopShell ? 'pt-14' : 'pt-[max(0.5rem,env(safe-area-inset-top))]'}`}
          >
            <div className="relative mx-auto flex max-w-4xl flex-col gap-4 px-4 py-4 md:px-6">
              {error ? (
                <p className="rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/12 to-red-600/5 px-3 py-2.5 text-[13px] text-red-700 shadow-[0_4px_20px_-8px_rgba(220,38,38,0.25)] dark:text-red-300">
                  {error}
                </p>
              ) : null}

              <header className={`app-view-page-header relative overflow-hidden ${shell} p-5 md:p-6`}>
                <div className="pointer-events-none absolute inset-0 bg-[#2563eb]" />
                <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="app-view-page-chrome min-w-0 space-y-1 text-white">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">Oficina</p>
                    <h1
                      id="vac-title"
                      className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-[1.75rem]"
                    >
                      <img src={VAC_MODULE_ICON} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                      Central do atendimento
                    </h1>
                    <p className="max-w-xl text-[14px] leading-relaxed text-blue-50">
                      Busque por placa, nome do cliente ou nome do veículo. Escolha se a lista vem do pátio (em
                      andamento) ou dos arquivados (finalizadas, canceladas, etc.). Ordem: mais recentes primeiro.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void loadOrders()}
                      disabled={ordersLoading}
                      className="inline-flex items-center gap-2 rounded-2xl bg-white/20 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-white/30 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${ordersLoading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </button>
                    {!isDesktopShell ? (
                      <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white shadow-lg transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
                      >
                        <X className="h-4 w-4" />
                        Fechar
                      </button>
                    ) : null}
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'No pátio', value: scopeStats.patio, card: 'border-blue-600 bg-blue-600' },
                  { label: 'Arquivados', value: scopeStats.arquivados, card: 'border-zinc-600 bg-zinc-500' },
                  { label: 'Total veículos', value: scopeStats.total, card: 'border-sky-600 bg-sky-500' },
                  {
                    label: orderScope === 'patio' ? 'Lista (pátio)' : 'Lista (arquivados)',
                    value: filteredOrdersForList.length,
                    card: 'border-violet-600 bg-violet-500',
                  },
                ].map((k) => (
                  <div key={k.label} className={`rounded-2xl border p-4 text-white shadow-md ${k.card}`}>
                    <p className="text-[12px] font-semibold text-white/90">{k.label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">
                      {ordersLoading ? '—' : k.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className={`${shell} p-4`}>
                <p className="mb-3 text-[12px] font-semibold text-zinc-600 dark:text-zinc-400">Origem da lista</p>
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderScope('patio')}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[13px] font-semibold transition ${
                      orderScope === 'patio'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'border border-zinc-200/90 bg-white text-zinc-800 hover:border-blue-300 dark:border-white/[0.1] dark:bg-zinc-950 dark:text-zinc-100'
                    }`}
                  >
                    <CarFront className="h-4 w-4 shrink-0" />
                    No pátio
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderScope('arquivados')}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[13px] font-semibold transition ${
                      orderScope === 'arquivados'
                        ? 'bg-zinc-800 text-white shadow-md dark:bg-zinc-700'
                        : 'border border-zinc-200/90 bg-white text-zinc-800 hover:border-zinc-400 dark:border-white/[0.1] dark:bg-zinc-950 dark:text-zinc-100'
                    }`}
                  >
                    <Archive className="h-4 w-4 shrink-0" />
                    Arquivados
                  </button>
                  {listSearch.trim() ? (
                    <button
                      type="button"
                      onClick={() => setListSearch('')}
                      className="ml-auto text-[12px] font-semibold text-blue-600 dark:text-blue-400"
                    >
                      Limpar busca
                    </button>
                  ) : null}
                </div>

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="search"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Placa, cliente ou nome do veículo…"
                    className="w-full rounded-2xl border border-zinc-200/90 bg-white py-2.5 pl-10 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/[0.1] dark:bg-zinc-950 dark:text-white"
                    autoComplete="off"
                  />
                </div>

                <p className="mb-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Ordenação: data de criação (mais recente no topo).
                  {selectedOrder
                    ? ` OS #${selectedOrder.os_number ?? '—'} selecionada.`
                    : ' Toque num veículo na lista para ver detalhes, fotos e partilha.'}
                </p>

                {ordersLoading ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-zinc-500">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                    <p className="text-[14px]">A carregar ordens de serviço…</p>
                  </div>
                ) : filteredOrdersForList.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <CarFront className="h-12 w-12 text-blue-500 opacity-80" />
                    <p className="text-[15px] font-medium text-zinc-700 dark:text-zinc-300">
                      {listSearch.trim()
                        ? 'Nenhum veículo corresponde à busca nesta origem.'
                        : orderScope === 'patio'
                          ? 'Não há veículos no pátio neste momento.'
                          : 'Não há veículos arquivados para mostrar.'}
                    </p>
                  </div>
                ) : (
                  <div className="flex max-h-[min(52vh,28rem)] flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
                    {filteredOrdersForList.map((o) => {
                      const customer = o.customer_name || o.customers?.name || 'Cliente';
                      const plate = (o.plate || '—').toUpperCase();
                      const vehicle = vehicleDisplayName(o);
                      const stageName =
                        getStageConfig(o.status)?.name ?? o.status.replace(/_/g, ' ');
                      const selected = o.id === selectedId;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setSelectedId(o.id)}
                          className={`w-full rounded-2xl border p-4 text-left transition hover:border-blue-400/60 hover:shadow-md dark:hover:border-blue-500/40 ${
                            selected
                              ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-500/40 dark:border-blue-500/50 dark:bg-blue-950/30'
                              : 'border-zinc-200/80 bg-white dark:border-white/[0.08] dark:bg-zinc-950/50'
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-lg bg-zinc-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                              {plate}
                            </span>
                            <span
                              className={`rounded-lg border-2 border-black/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${getStageStyle(o.status)}`}
                            >
                              {stageName}
                            </span>
                            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                              OS #{o.os_number ?? '—'}
                            </span>
                          </div>
                          <h3 className="mt-2 text-[15px] font-bold text-zinc-900 dark:text-white">{vehicle}</h3>
                          <p className="mt-0.5 text-[13px] text-zinc-600 dark:text-zinc-400">{customer}</p>
                          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                            Entrada: {new Date(o.created_at).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

            {selectedOrder ? (
              <>
                <section className={`relative pl-5 pr-4 py-4 ${vacCard} space-y-3`}>
                  <span className={vacCardAccent} aria-hidden />
                  <h2 className={`${vacSectionTitle} relative`}>Dados da OS e consulta placa (Mercosul)</h2>
                  <div className="text-[14px] space-y-1 text-zinc-800 dark:text-zinc-200">
                    <p>
                      <span className="text-zinc-500">Placa na OS: </span>
                      <span className="font-mono font-semibold">{(selectedOrder.plate || '—').toUpperCase()}</span>
                    </p>
                    <p>
                      <span className="text-zinc-500">Cliente: </span>
                      {selectedOrder.customer_name || selectedOrder.customers?.name || '—'}
                    </p>
                    <p>
                      {[selectedOrder.vehicle_brand, selectedOrder.vehicle_model].filter(Boolean).join(' ') || '—'}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <input
                      value={placaExtra}
                      onChange={(e) => setPlacaExtra(e.target.value.toUpperCase())}
                      placeholder="Outra placa (opcional)"
                      maxLength={7}
                      className="flex-1 rounded-xl border border-zinc-200/90 bg-white/95 px-3 py-2.5 font-mono text-[15px] shadow-inner shadow-zinc-900/5 focus:border-[#007AFF]/45 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 dark:border-white/[0.12] dark:bg-zinc-950/90"
                    />
                    <button
                      type="button"
                      onClick={() => void handleConsultPlaca()}
                      disabled={placaLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-950 px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] transition-transform hover:brightness-110 active:scale-[0.98] disabled:opacity-50 dark:from-white dark:to-zinc-200 dark:text-zinc-900 dark:shadow-[0_8px_28px_-8px_rgba(255,255,255,0.15)]"
                    >
                      {placaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Consultar
                    </button>
                  </div>
                  {placaLookup ? (
                    <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/95 to-blue-50/80 p-4 text-[13px] space-y-1 shadow-[0_8px_28px_-12px_rgba(14,165,233,0.25)] dark:border-sky-500/25 dark:from-sky-950/50 dark:to-blue-950/30 dark:shadow-[0_12px_36px_-12px_rgba(56,189,248,0.12)]">
                      <p className="font-mono font-semibold">{placaLookup.plate}</p>
                      <p>
                        {[placaLookup.vehicleBrand, placaLookup.vehicleModel].filter(Boolean).join(' ') || '—'}
                      </p>
                      <p className="text-zinc-600 dark:text-zinc-400">
                        {placaLookup.vehicleYear || '—'} · {placaLookup.vehicleColor || '—'}
                      </p>
                      <p className="text-[11px] text-zinc-500 pt-1">Referência FIPE — não altera a OS automaticamente.</p>
                    </div>
                  ) : null}
                </section>

                <section className={`relative pl-5 pr-4 py-4 ${vacCard} space-y-3`}>
                  <span className={vacCardAccent} aria-hidden />
                  <h2 className={`${vacSectionTitle} relative`}>Estado no pátio</h2>
                  <span
                    className={`relative inline-flex rounded-xl border-2 border-black/10 px-3 py-1.5 text-[13px] font-black uppercase tracking-widest shadow-md ${getStageStyle(selectedOrder.status)}`}
                  >
                    {getStageConfig(selectedOrder.status)?.name ?? selectedOrder.status.replace(/_/g, ' ')}
                  </span>
                </section>

                <section className={`relative pl-5 pr-4 py-4 ${vacCard} space-y-3`}>
                  <span className={vacCardAccent} aria-hidden />
                  <div className="relative flex items-center justify-between gap-2">
                    <h2 className={vacSectionTitle}>Fotos da entrada</h2>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#007AFF] to-sky-600 px-3 py-1.5 text-[13px] font-semibold text-white shadow-[0_4px_16px_-4px_rgba(0,122,255,0.55)] transition hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      Adicionar
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePickFile} />
                  </div>
                  <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
                    Toque na imagem para colocar um marcador. Toque no pin para remover.
                  </p>
                  {photos.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-300/80 bg-zinc-50/80 py-10 text-center text-sm text-zinc-500 dark:border-white/[0.12] dark:bg-zinc-900/40 dark:text-zinc-400">
                      Nenhuma foto ainda — use <span className="font-semibold text-sky-600 dark:text-sky-400">Adicionar</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {photos.map((ph) => (
                        <div key={ph.id} className="space-y-2">
                          <div
                            role="presentation"
                            className="relative w-full cursor-crosshair overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-900/5 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.4)] ring-1 ring-black/[0.04] dark:border-white/[0.1] dark:bg-zinc-950 dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] dark:ring-white/[0.05]"
                            onClick={(e) => onPhotoTap(ph.id, e)}
                          >
                            <img
                              src={getVehiclePhotoPublicUrl(ph.path) ?? ''}
                              alt=""
                              className="w-full h-auto max-h-[320px] object-contain pointer-events-none bg-black/5"
                              onError={(ev) => {
                                const el = ev.currentTarget;
                                if (el.src.startsWith('blob:')) return;
                                el.style.opacity = '0.3';
                              }}
                            />
                            {ph.markers.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                data-marker-pin
                                className="absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[#007AFF] to-sky-600 text-[10px] font-bold text-white shadow-[0_4px_14px_-2px_rgba(0,122,255,0.7)] dark:border-zinc-900"
                                style={{ left: `${m.xPct}%`, top: `${m.yPct}%` }}
                                title={m.note || 'Marcador — clique para remover'}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  removeMarker(ph.id, m.id);
                                }}
                              >
                                !
                              </button>
                            ))}
                          </div>
                          {ph.markers.some((m) => m.note) ? (
                            <ul className="text-[12px] text-zinc-600 dark:text-zinc-400 pl-1 space-y-0.5">
                              {ph.markers
                                .filter((m) => m.note?.trim())
                                .map((m) => (
                                  <li key={m.id}>• {m.note}</li>
                                ))}
                            </ul>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removePhoto(ph.id)}
                            className="inline-flex items-center gap-1 text-[13px] text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" /> Remover foto
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className={`relative pl-5 pr-4 py-4 ${vacCard}`}>
                  <span className={vacCardAccent} aria-hidden />
                  <label className={`${vacSectionTitle} relative mb-3 block`}>Observações da entrada</label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-zinc-200/90 bg-white/95 px-3 py-2.5 text-[14px] text-zinc-900 shadow-inner shadow-zinc-900/[0.03] placeholder:text-zinc-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/25 dark:border-white/[0.12] dark:bg-zinc-950/80 dark:text-white dark:shadow-black/20"
                    placeholder="Checklist, danos visíveis, acessórios…"
                  />
                </section>

                <section className={`relative pl-5 pr-4 py-4 ${vacCard} space-y-3`}>
                  <span className={vacCardAccent} aria-hidden />
                  <h2 className={`${vacSectionTitle} relative flex items-center gap-2`}>
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#007AFF] dark:text-[#64B5FF]" strokeWidth={2.25} />
                    Orçamentos com itens aprovados
                  </h2>
                  {budgets.length === 0 ? (
                    <p className="text-[13px] text-zinc-500">Nenhum orçamento com itens aprovados nesta OS.</p>
                  ) : (
                    <ul className="space-y-2 text-[14px]">
                      {budgets.map((b) => (
                        <li
                          key={b.id}
                          className="rounded-xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/90 to-white/70 px-3 py-2 shadow-sm dark:border-emerald-500/15 dark:from-emerald-950/25 dark:to-zinc-900/50"
                        >
                          <span className="font-medium text-zinc-900 dark:text-white">
                            Orçamento · {new Date(b.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                          {b.diagnosis?.trim() ? (
                            <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">{b.diagnosis}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {acc?.share_token ? (
                  <section className="relative overflow-hidden rounded-[16px] border border-zinc-200/80 bg-gradient-to-br from-violet-50/90 via-white/85 to-sky-50/80 p-4 shadow-[0_12px_40px_-14px_rgba(109,40,217,0.15)] dark:border-violet-500/20 dark:from-violet-950/40 dark:via-zinc-900/70 dark:to-sky-950/30 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.5)]">
                    <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet-400/20 blur-3xl dark:bg-violet-500/10" aria-hidden />
                    <h2 className={`relative mb-2 ${vacSectionTitle}`}>Partilhar com o cliente</h2>
                    <p className="relative mb-3 break-all rounded-xl border border-white/60 bg-white/60 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-600 backdrop-blur-sm dark:border-white/[0.08] dark:bg-zinc-950/40 dark:text-zinc-300">
                      {companionPublicUrl(acc.share_token)}
                    </p>
                    <div className="relative flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={copyLink}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/95 px-4 py-2.5 text-[14px] font-semibold text-zinc-900 shadow-md transition hover:bg-white active:scale-[0.98] dark:border-white/[0.12] dark:bg-zinc-800/90 dark:text-white dark:shadow-lg"
                      >
                        <Copy className="h-4 w-4" />
                        Copiar link
                      </button>
                      <button
                        type="button"
                        onClick={openWhatsApp}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#25D366] to-emerald-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_6px_22px_-6px_rgba(37,211,102,0.65)] transition hover:brightness-110 active:scale-[0.98]"
                      >
                        <MessageCircle className="h-4 w-4" />
                        WhatsApp
                      </button>
                    </div>
                  </section>
                ) : null}

                <div className="sticky bottom-0 z-20 -mx-4 flex gap-2 border-t border-zinc-200/60 bg-gradient-to-t from-zinc-100/95 via-zinc-100/80 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-lg dark:border-white/[0.07] dark:from-zinc-950/95 dark:via-zinc-950/75">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand-yellow via-amber-300 to-amber-400 py-3.5 font-semibold text-zinc-950 shadow-[0_6px_24px_-4px_rgba(234,179,8,0.55),inset_0_1px_0_rgba(255,255,255,0.5)] transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50 dark:shadow-[0_8px_28px_-6px_rgba(234,179,8,0.35)]"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    Guardar
                  </button>
                </div>
              </>
            ) : null}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
