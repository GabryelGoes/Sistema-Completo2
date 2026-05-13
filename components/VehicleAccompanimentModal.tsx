import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Camera, Copy, MessageCircle, Trash2, MapPin, Search, Save } from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
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

/** Cartão com vidro, sombra em camadas e leve tinta (Central do atendimento). */
const vacCard =
  'relative overflow-hidden rounded-[22px] border border-white/55 dark:border-white/[0.09] ' +
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

const sortOrdersForUi = (a: ServiceOrderListItem, b: ServiceOrderListItem) => {
  const na = a.os_number ?? 0;
  const nb = b.os_number ?? 0;
  if (na !== nb) return nb - na;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
};

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
  const fileRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      setSelectedId(initialServiceOrderId ?? "");
      wasOpenRef.current = true;
    }
  }, [isOpen, initialServiceOrderId]);

  const { patioOrders, otherOrders } = useMemo(() => {
    const nonCancelled = orders.filter((o) => o.status !== "CANCELLED");
    const patio = nonCancelled.filter((o) => isServiceOrderActivePatioFlow(o.status)).sort(sortOrdersForUi);
    const other = nonCancelled.filter((o) => !isServiceOrderActivePatioFlow(o.status)).sort(sortOrdersForUi);
    return { patioOrders: patio, otherOrders: other };
  }, [orders]);

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

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[140] flex flex-col bg-zinc-950/80 backdrop-blur-md dark:bg-black/85"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vac-title"
      >
        {/* Atmosfera — orbes suaves (marca + azul iOS + violeta) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-[12%] h-[min(420px,55vw)] w-[min(420px,55vw)] rounded-full bg-[#007AFF]/30 blur-[100px] dark:bg-[#007AFF]/22" />
          <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-brand-yellow/35 blur-[95px] dark:bg-brand-yellow/18" />
          <div className="absolute bottom-0 left-0 h-72 w-72 translate-y-1/4 rounded-full bg-violet-500/25 blur-[88px] dark:bg-violet-500/14" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,255,255,0.14),transparent_55%)] dark:bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(0,122,255,0.12),transparent_50%)]" />
        </div>

        <div className="relative flex min-h-0 h-[100dvh] w-full max-w-none flex-1 flex-col overflow-hidden rounded-none border-0 bg-gradient-to-b from-zinc-50/95 via-light-page to-zinc-100/90 dark:from-zinc-950 dark:via-[#0a0c12] dark:to-black">
          <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200/60 bg-gradient-to-r from-white/80 via-[#f0f4ff]/90 to-[#fff9e6]/80 px-4 py-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl dark:border-white/[0.07] dark:from-zinc-900/80 dark:via-[#0d1528]/85 dark:to-zinc-950/80">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#007AFF]/35 to-transparent dark:via-[#64B5FF]/30" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#007AFF] dark:text-[#7ab8ff]">
                Oficina
              </p>
              <h1 id="vac-title" className="text-[18px] font-bold tracking-tight text-zinc-950 dark:text-white">
                Central do atendimento
              </h1>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200/80 bg-white/90 text-zinc-700 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.12)] transition-all hover:bg-white hover:shadow-md active:scale-95 dark:border-white/[0.1] dark:bg-zinc-800/90 dark:text-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5 space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] [scrollbar-gutter:stable]">
            {error ? (
              <p className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/12 to-red-600/5 px-3 py-2.5 text-[13px] text-red-700 shadow-[0_4px_20px_-8px_rgba(220,38,38,0.25)] dark:text-red-300">
                {error}
              </p>
            ) : null}

            <section className={`relative pl-5 pr-4 py-4 ${vacCard}`}>
              <span className={vacCardAccent} aria-hidden />
              <label className={`${vacSectionTitle} relative block mb-3`}>
                Ordem de serviço (veículo)
              </label>
              {ordersLoading ? (
                <div className="flex items-center gap-2 text-zinc-500 text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
                </div>
              ) : (
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200/90 bg-white/95 px-3 py-3.5 text-[15px] text-zinc-900 shadow-inner shadow-zinc-900/5 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.12] dark:bg-zinc-950/90 dark:text-white dark:focus:ring-[#64B5FF]/30"
                >
                  <option value="">Selecione uma OS…</option>
                  {patioOrders.length > 0 ? (
                    <optgroup label="Veículos no pátio (em andamento)">
                      {patioOrders.map((o) => (
                        <option key={o.id} value={o.id}>
                          OS #{o.os_number ?? '—'} · {(o.plate || 'sem placa').toUpperCase()} ·{' '}
                          {(o.customer_name || o.customers?.name || 'Cliente').slice(0, 40)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {otherOrders.length > 0 ? (
                    <optgroup label={patioOrders.length > 0 ? 'Demais OS' : 'Ordens de serviço'}>
                      {otherOrders.map((o) => (
                        <option key={o.id} value={o.id}>
                          OS #{o.os_number ?? '—'} · {(o.plate || 'sem placa').toUpperCase()} ·{' '}
                          {(o.customer_name || o.customers?.name || 'Cliente').slice(0, 40)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              )}
            </section>

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
                      className="flex-1 rounded-2xl border border-zinc-200/90 bg-white/95 px-3 py-2.5 font-mono text-[15px] shadow-inner shadow-zinc-900/5 focus:border-[#007AFF]/45 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 dark:border-white/[0.12] dark:bg-zinc-950/90"
                    />
                    <button
                      type="button"
                      onClick={() => void handleConsultPlaca()}
                      disabled={placaLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] transition-transform hover:brightness-110 active:scale-[0.98] disabled:opacity-50 dark:from-white dark:to-zinc-200 dark:text-zinc-900 dark:shadow-[0_8px_28px_-8px_rgba(255,255,255,0.15)]"
                    >
                      {placaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Consultar
                    </button>
                  </div>
                  {placaLookup ? (
                    <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/95 to-blue-50/80 p-4 text-[13px] space-y-1 shadow-[0_8px_28px_-12px_rgba(14,165,233,0.25)] dark:border-sky-500/25 dark:from-sky-950/50 dark:to-blue-950/30 dark:shadow-[0_12px_36px_-12px_rgba(56,189,248,0.12)]">
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
                    <div className="rounded-2xl border border-dashed border-zinc-300/80 bg-zinc-50/80 py-10 text-center text-sm text-zinc-500 dark:border-white/[0.12] dark:bg-zinc-900/40 dark:text-zinc-400">
                      Nenhuma foto ainda — use <span className="font-semibold text-sky-600 dark:text-sky-400">Adicionar</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {photos.map((ph) => (
                        <div key={ph.id} className="space-y-2">
                          <div
                            role="presentation"
                            className="relative w-full cursor-crosshair overflow-hidden rounded-2xl border border-zinc-200/90 bg-zinc-900/5 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.4)] ring-1 ring-black/[0.04] dark:border-white/[0.1] dark:bg-zinc-950 dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] dark:ring-white/[0.05]"
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
                    className="w-full rounded-2xl border border-zinc-200/90 bg-white/95 px-3 py-2.5 text-[14px] text-zinc-900 shadow-inner shadow-zinc-900/[0.03] placeholder:text-zinc-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/25 dark:border-white/[0.12] dark:bg-zinc-950/80 dark:text-white dark:shadow-black/20"
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
                  <section className="relative overflow-hidden rounded-[22px] border border-zinc-200/80 bg-gradient-to-br from-violet-50/90 via-white/85 to-sky-50/80 p-4 shadow-[0_12px_40px_-14px_rgba(109,40,217,0.15)] dark:border-violet-500/20 dark:from-violet-950/40 dark:via-zinc-900/70 dark:to-sky-950/30 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.5)]">
                    <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet-400/20 blur-3xl dark:bg-violet-500/10" aria-hidden />
                    <h2 className={`relative mb-2 ${vacSectionTitle}`}>Partilhar com o cliente</h2>
                    <p className="relative mb-3 break-all rounded-xl border border-white/60 bg-white/60 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-600 backdrop-blur-sm dark:border-white/[0.08] dark:bg-zinc-950/40 dark:text-zinc-300">
                      {companionPublicUrl(acc.share_token)}
                    </p>
                    <div className="relative flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={copyLink}
                        className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white/95 px-4 py-2.5 text-[14px] font-semibold text-zinc-900 shadow-md transition hover:bg-white active:scale-[0.98] dark:border-white/[0.12] dark:bg-zinc-800/90 dark:text-white dark:shadow-lg"
                      >
                        <Copy className="h-4 w-4" />
                        Copiar link
                      </button>
                      <button
                        type="button"
                        onClick={openWhatsApp}
                        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-[#25D366] to-emerald-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_6px_22px_-6px_rgba(37,211,102,0.65)] transition hover:brightness-110 active:scale-[0.98]"
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
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-brand-yellow via-amber-300 to-amber-400 py-3.5 font-semibold text-zinc-950 shadow-[0_6px_24px_-4px_rgba(234,179,8,0.55),inset_0_1px_0_rgba(255,255,255,0.5)] transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50 dark:shadow-[0_8px_28px_-6px_rgba(234,179,8,0.35)]"
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
    </ModalPortal>
  );
};
