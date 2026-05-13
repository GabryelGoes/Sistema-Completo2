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
import { isServiceOrderActivePatioFlow } from '../constants/serviceOrderStages';

const iosCard =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.07] bg-white/75 dark:bg-zinc-900/45 backdrop-blur-xl ' +
  'shadow-[0_10px_36px_-8px_rgba(63,63,70,0.18)] dark:shadow-[0_14px_40px_-10px_rgba(0,0,0,0.35)]';

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
        className="fixed inset-0 z-[140] flex flex-col bg-zinc-950/90 dark:bg-black/95 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vac-title"
      >
        <div className="flex min-h-0 h-[100dvh] w-full max-w-none flex-1 flex-col overflow-hidden rounded-none border-0 bg-light-page dark:bg-zinc-950 shadow-none">
          <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-zinc-200/80 dark:border-white/[0.08]">
            <h1 id="vac-title" className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">
              Central do atendimento
            </h1>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {error ? (
              <p className="text-[13px] text-red-600 dark:text-red-400 rounded-2xl bg-red-500/10 border border-red-500/20 px-3 py-2">
                {error}
              </p>
            ) : null}

            <section className={`p-4 ${iosCard}`}>
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 block mb-2">
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
                  className="w-full rounded-2xl border border-zinc-200 dark:border-white/[0.12] bg-white/90 dark:bg-zinc-950/80 px-3 py-3 text-[15px] text-zinc-900 dark:text-white"
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
                <section className={`p-4 ${iosCard} space-y-3`}>
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Dados da OS e consulta placa (Mercosul)
                  </h2>
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
                      className="flex-1 rounded-2xl border border-zinc-200 dark:border-white/[0.12] bg-white/90 dark:bg-zinc-950/80 px-3 py-2.5 font-mono text-[15px]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleConsultPlaca()}
                      disabled={placaLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50"
                    >
                      {placaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Consultar
                    </button>
                  </div>
                  {placaLookup ? (
                    <div className="rounded-2xl bg-zinc-100/90 dark:bg-zinc-900/60 p-3 text-[13px] space-y-1 border border-zinc-200/60 dark:border-white/[0.06]">
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

                <section className={`p-4 ${iosCard} space-y-2`}>
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Estado no pátio
                  </h2>
                  <p className="text-[15px] font-medium text-zinc-900 dark:text-white">{selectedOrder.status}</p>
                </section>

                <section className={`p-4 ${iosCard} space-y-3`}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                      Fotos da entrada
                    </h2>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#007AFF] text-white text-[13px] font-semibold px-3 py-1.5 disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      Adicionar
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePickFile} />
                  </div>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                    Toque na imagem para colocar um marcador. Toque no pin para remover.
                  </p>
                  {photos.length === 0 ? (
                    <p className="text-sm text-zinc-500 py-2">Nenhuma foto ainda.</p>
                  ) : (
                    <div className="space-y-4">
                      {photos.map((ph) => (
                        <div key={ph.id} className="space-y-2">
                          <div
                            role="presentation"
                            className="relative w-full overflow-hidden rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-100 dark:bg-zinc-900 cursor-crosshair"
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
                                className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#007AFF] text-white text-[10px] font-bold flex items-center justify-center shadow-lg border-2 border-white dark:border-zinc-900 z-10"
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

                <section className={`p-4 ${iosCard}`}>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 block mb-2">
                    Observações da entrada
                  </label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border border-zinc-200 dark:border-white/[0.12] bg-white/90 dark:bg-zinc-950/80 px-3 py-2.5 text-[14px] text-zinc-900 dark:text-white"
                    placeholder="Checklist, danos visíveis, acessórios…"
                  />
                </section>

                <section className={`p-4 ${iosCard} space-y-3`}>
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" />
                    Orçamentos com itens aprovados
                  </h2>
                  {budgets.length === 0 ? (
                    <p className="text-[13px] text-zinc-500">Nenhum orçamento com itens aprovados nesta OS.</p>
                  ) : (
                    <ul className="space-y-2 text-[14px]">
                      {budgets.map((b) => (
                        <li
                          key={b.id}
                          className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] px-3 py-2 bg-zinc-50/80 dark:bg-zinc-900/40"
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
                  <section className={`p-4 ${iosCard} space-y-3`}>
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                      Partilhar com o cliente
                    </h2>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 break-all">{companionPublicUrl(acc.share_token)}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={copyLink}
                        className="inline-flex items-center gap-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-[14px] font-semibold text-zinc-900 dark:text-white"
                      >
                        <Copy className="h-4 w-4" />
                        Copiar link
                      </button>
                      <button
                        type="button"
                        onClick={openWhatsApp}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#25D366] text-white px-4 py-2.5 text-[14px] font-semibold"
                      >
                        <MessageCircle className="h-4 w-4" />
                        WhatsApp
                      </button>
                    </div>
                  </section>
                ) : null}

                <div className="flex gap-2 pb-4">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-zinc-950 font-semibold py-3.5 disabled:opacity-50"
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
