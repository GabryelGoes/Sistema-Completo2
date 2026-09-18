import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FileText,
  Link2,
  Loader2,
  PackagePlus,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  confirmNfeStockInbound,
  createPartFromNfeItem,
  getWorkshopParts,
  lookupNfeStockInbound,
  mapNfeStockInboundItem,
  type NfeAlreadyImportedError,
  type NfeSefazStatusPayload,
  type NfeStockInboundEntry,
  type NfeStockInboundItem,
  type WorkshopPart,
} from '../services/apiService';
import { digitsOnlyNfeAccessKey, validateNfeAccessKey } from '../utils/nfeAccessKey';
import { searchWorkshopPartsByText } from '../utils/workshopPartBarcode';
import { getStoredAuth } from './views/LoginView';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { resolveIosModalOverlayClass, NESTED_STOCK_OVERLAY_Z } from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type NfeStockInboundModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onStockChanged?: () => void;
  overlayZClass?: string;
};

type Phase = 'scan' | 'loading' | 'conference' | 'done' | 'duplicate';

function fmtMoney(n: number | null | undefined): string {
  return `R$ ${Number(n ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function recordedByFromAuth(): string | null {
  const auth = getStoredAuth();
  return (
    auth?.displayName?.trim() ||
    auth?.username?.trim() ||
    (auth?.role === 'admin' ? 'Gerência' : null)
  );
}

export function NfeStockInboundModal({
  isOpen,
  onClose,
  onStockChanged,
  overlayZClass = NESTED_STOCK_OVERLAY_Z,
}: NfeStockInboundModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('scan');
  const [accessKeyInput, setAccessKeyInput] = useState('');
  const [xmlPaste, setXmlPaste] = useState('');
  const [showXmlPaste, setShowXmlPaste] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [sefaz, setSefaz] = useState<NfeSefazStatusPayload | null>(null);
  const [entry, setEntry] = useState<NfeStockInboundEntry | null>(null);
  const [items, setItems] = useState<NfeStockInboundItem[]>([]);
  const [duplicateInfo, setDuplicateInfo] = useState<Record<string, unknown> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<WorkshopPart[]>([]);
  const [linkItemId, setLinkItemId] = useState<string | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  useBrowserBackLayer(isOpen, onClose);

  const reset = useCallback(() => {
    setPhase('scan');
    setAccessKeyInput('');
    setXmlPaste('');
    setShowXmlPaste(false);
    setError(null);
    setHint(null);
    setSefaz(null);
    setEntry(null);
    setItems([]);
    setDuplicateInfo(null);
    setConfirming(false);
    setSuccessMsg(null);
    setLinkItemId(null);
    setLinkQuery('');
    setBusyItemId(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    reset();
    void getWorkshopParts()
      .then(setCatalog)
      .catch(() => setCatalog([]));
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [isOpen, reset]);

  useEffect(() => {
    if (!isOpen || phase !== 'scan') return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [isOpen, phase]);

  const selectedCount = useMemo(
    () => items.filter((i) => i.selected).length,
    [items]
  );
  const unmappedSelected = useMemo(
    () => items.filter((i) => i.selected && (!i.matched_part_id || i.needs_mapping)),
    [items]
  );

  const runLookup = useCallback(async (rawKey: string, xml?: string) => {
    const validated = validateNfeAccessKey(rawKey);
    if (validated.ok === false) {
      setError(validated.error);
      setPhase('scan');
      return;
    }
    setPhase('loading');
    setError(null);
    setHint(null);
    setDuplicateInfo(null);
    try {
      const result = await lookupNfeStockInbound({
        access_key: validated.accessKey,
        xml: xml?.trim() || null,
      });
      setSefaz(result.sefaz);
      setEntry(result.entry);
      setItems(
        (result.entry.items || []).map((it) => ({
          ...it,
          needs_mapping: !it.matched_part_id,
        }))
      );
      setPhase('conference');
      setAccessKeyInput(validated.accessKey);
    } catch (e) {
      const already = e as NfeAlreadyImportedError;
      if (already?.code === 'NFE_ALREADY_IMPORTED') {
        setDuplicateInfo(already.entry || null);
        setPhase('duplicate');
        setError(already.message);
        return;
      }
      const err = e as Error & { sefaz?: NfeSefazStatusPayload; hint?: string; code?: string };
      if (err.sefaz) setSefaz(err.sefaz);
      if (err.hint) setHint(err.hint);
      if (
        err.code === 'NFE_SEFAZ_NOT_CONFIGURED' ||
        err.code === 'NFE_SEFAZ_NOT_IMPLEMENTED' ||
        /SEFAZ|XML|certificado/i.test(err.message || '')
      ) {
        setShowXmlPaste(true);
      }
      setError(err.message || 'Falha ao consultar NF-e.');
      setPhase('scan');
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, []);

  const handleScanSubmit = useCallback(() => {
    void runLookup(accessKeyInput, xmlPaste);
  }, [accessKeyInput, runLookup, xmlPaste]);

  const toggleItem = useCallback(
    async (item: NfeStockInboundItem) => {
      if (!entry?.entry_id || !item.item_id) return;
      const next = !item.selected;
      setItems((prev) =>
        prev.map((it) => (it.item_id === item.item_id ? { ...it, selected: next } : it))
      );
      try {
        await mapNfeStockInboundItem(entry.entry_id, {
          item_id: item.item_id,
          selected: next,
          part_id: item.matched_part_id,
        });
      } catch (e) {
        setItems((prev) =>
          prev.map((it) => (it.item_id === item.item_id ? { ...it, selected: item.selected } : it))
        );
        setError(e instanceof Error ? e.message : 'Falha ao atualizar item.');
      }
    },
    [entry?.entry_id]
  );

  const linkPart = useCallback(
    async (item: NfeStockInboundItem, part: WorkshopPart) => {
      if (!entry?.entry_id || !item.item_id) return;
      setBusyItemId(item.item_id);
      setError(null);
      try {
        await mapNfeStockInboundItem(entry.entry_id, {
          item_id: item.item_id,
          part_id: part.id,
          selected: true,
        });
        setItems((prev) =>
          prev.map((it) =>
            it.item_id === item.item_id
              ? {
                  ...it,
                  matched_part_id: part.id,
                  matched_part_name: part.name,
                  match_method: 'manual',
                  needs_mapping: false,
                  selected: true,
                }
              : it
          )
        );
        setLinkItemId(null);
        setLinkQuery('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao vincular produto.');
      } finally {
        setBusyItemId(null);
      }
    },
    [entry?.entry_id]
  );

  const createNewPart = useCallback(
    async (item: NfeStockInboundItem) => {
      if (!entry?.entry_id || !item.item_id) return;
      setBusyItemId(item.item_id);
      setError(null);
      try {
        const part = await createPartFromNfeItem(entry.entry_id, {
          item_id: item.item_id,
          name: item.description,
          unit_price: item.unit_price,
        });
        setCatalog((prev) => {
          if (prev.some((p) => p.id === part.id)) return prev;
          return [...prev, part].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        });
        setItems((prev) =>
          prev.map((it) =>
            it.item_id === item.item_id
              ? {
                  ...it,
                  matched_part_id: part.id,
                  matched_part_name: part.name,
                  match_method: 'manual',
                  needs_mapping: false,
                  selected: true,
                }
              : it
          )
        );
        onStockChanged?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao cadastrar produto.');
      } finally {
        setBusyItemId(null);
      }
    },
    [entry?.entry_id, onStockChanged]
  );

  const handleConfirm = useCallback(async () => {
    if (!entry?.entry_id) return;
    if (unmappedSelected.length > 0) {
      setError(
        `Há ${unmappedSelected.length} produto(s) selecionado(s) sem vínculo no estoque. Vincule ou cadastre antes de confirmar.`
      );
      return;
    }
    if (selectedCount <= 0) {
      setError('Selecione ao menos um produto para dar entrada.');
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await confirmNfeStockInbound(entry.entry_id, {
        recorded_by_name: recordedByFromAuth(),
        items: items
          .filter((it) => it.item_id)
          .map((it) => ({
            item_id: it.item_id as string,
            part_id: it.matched_part_id,
            selected: it.selected,
          })),
      });
      setSuccessMsg('Entrada confirmada. Estoque atualizado.');
      setPhase('done');
      onStockChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao confirmar entrada.');
    } finally {
      setConfirming(false);
    }
  }, [entry?.entry_id, items, onStockChanged, selectedCount, unmappedSelected.length]);

  const linkCandidates = useMemo(() => {
    if (!linkQuery.trim()) return catalog.slice(0, 12);
    return searchWorkshopPartsByText(catalog, linkQuery, 12);
  }, [catalog, linkQuery]);

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, overlayZClass);
  const digitsPreview = digitsOnlyNfeAccessKey(accessKeyInput);

  return (
    <RegistrationPortal>
      <div
        className={overlayClass}
        role="dialog"
        aria-modal="true"
        aria-label="Entrada por NF-e"
        onClick={onClose}
      >
        <div
          className={`flex w-full flex-col overflow-hidden rounded-[1.75rem] border-0 bg-zinc-50 shadow-none dark:bg-zinc-950 ${
            isDesktopShell
              ? 'max-h-[min(860px,94vh)] max-w-4xl'
              : 'max-h-[min(940px,96vh)] max-w-lg'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200/60 px-5 py-4 dark:border-white/[0.08]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                Estoque de peças
              </p>
              <h2 className="text-[18px] font-bold text-zinc-900 dark:text-white sm:text-[20px]">
                Entrada por NF-e
              </h2>
              <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                Leitor USB na chave de 44 dígitos · conferência antes do estoque
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-700 dark:bg-white/10 dark:text-zinc-100"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
            {error ? (
              <div className="mb-3 rounded-2xl bg-red-50 px-3.5 py-3 text-[13px] font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200">
                {error}
                {hint ? <p className="mt-1 text-[12px] font-normal opacity-90">{hint}</p> : null}
              </div>
            ) : null}

            {phase === 'scan' || phase === 'loading' ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-white p-4 dark:bg-white/5">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Chave de acesso da NF-e
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    disabled={phase === 'loading'}
                    value={accessKeyInput}
                    onChange={(e) => setAccessKeyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleScanSubmit();
                      }
                    }}
                    placeholder="Aguardando leitura da NF-e..."
                    className="mt-2 w-full rounded-2xl border-0 bg-zinc-100 px-4 py-4 text-center text-[18px] font-bold tracking-wide text-zinc-900 outline-none ring-emerald-500/30 focus:ring-2 dark:bg-black/25 dark:text-white"
                    aria-label="Aguardando leitura da NF-e"
                  />
                  <p className="mt-2 text-center text-[12px] text-zinc-500">
                    {digitsPreview.length > 0
                      ? `${digitsPreview.length}/44 dígitos`
                      : 'Passe o leitor ou digite a chave e pressione Enter'}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={phase === 'loading'}
                  onClick={handleScanSubmit}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {phase === 'loading' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Search className="h-5 w-5" />
                  )}
                  {phase === 'loading' ? 'Consultando NF-e…' : 'Buscar NF-e'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowXmlPaste((v) => !v)}
                  className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-300"
                >
                  {showXmlPaste ? 'Ocultar XML opcional' : 'Alternativa: colar XML oficial da NF-e'}
                </button>

                {showXmlPaste ? (
                  <div className="rounded-2xl bg-white p-4 dark:bg-white/5">
                    <p className="text-[12px] text-zinc-500">
                      Use o XML baixado no portal da SEFAZ quando a consulta automática ainda não estiver
                      configurada no servidor. O certificado digital nunca fica no PWA.
                    </p>
                    <textarea
                      value={xmlPaste}
                      onChange={(e) => setXmlPaste(e.target.value)}
                      rows={6}
                      placeholder="Cole aqui o XML da NF-e…"
                      className="mt-2 w-full rounded-xl border-0 bg-zinc-100 px-3 py-2 text-[12px] text-zinc-800 outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-black/25 dark:text-zinc-100"
                    />
                  </div>
                ) : null}

                {sefaz && !sefaz.certificate_ready ? (
                  <div className="rounded-2xl bg-amber-50 px-3.5 py-3 text-[12px] text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="font-bold">SEFAZ ainda não configurada no servidor</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {sefaz.missing_env.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {phase === 'duplicate' ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/40">
                  <p className="text-[15px] font-bold text-amber-950 dark:text-amber-100">
                    Esta NF-e já foi lançada no estoque.
                  </p>
                  {duplicateInfo?.confirmed_at ? (
                    <p className="mt-1 text-[13px] text-amber-900/90 dark:text-amber-200/90">
                      Entrada anterior: {fmtDate(String(duplicateInfo.confirmed_at))}
                      {duplicateInfo.confirmed_by_name
                        ? ` · ${String(duplicateInfo.confirmed_by_name)}`
                        : ''}
                    </p>
                  ) : null}
                  {duplicateInfo?.nfe_number ? (
                    <p className="mt-1 text-[13px] text-amber-900/90 dark:text-amber-200/90">
                      NF {String(duplicateInfo.nfe_number)}
                      {duplicateInfo.nfe_series ? ` · Série ${String(duplicateInfo.nfe_series)}` : ''}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-zinc-200 px-4 py-3 text-[15px] font-semibold text-zinc-900 dark:bg-white/10 dark:text-white"
                >
                  Ler outra NF-e
                </button>
              </div>
            ) : null}

            {phase === 'done' ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check className="h-7 w-7" />
                </div>
                <p className="text-[16px] font-bold text-zinc-900 dark:text-white">{successMsg}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-[15px] font-semibold text-white"
                  >
                    Nova entrada
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-2xl bg-zinc-200 px-4 py-3 text-[15px] font-semibold text-zinc-900 dark:bg-white/10 dark:text-white"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : null}

            {phase === 'conference' && entry ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-white p-4 dark:bg-white/5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        Fornecedor
                      </p>
                      <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">
                        {entry.supplier_name || '—'}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase text-zinc-400">NF</p>
                          <p className="font-semibold tabular-nums">{entry.nfe_number || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-zinc-400">Série</p>
                          <p className="font-semibold tabular-nums">{entry.nfe_series || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-zinc-400">Data</p>
                          <p className="font-semibold">{fmtDate(entry.issued_at)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-zinc-400">Total</p>
                          <p className="font-semibold tabular-nums">{fmtMoney(entry.total_amount)}</p>
                        </div>
                      </div>
                      <p className="mt-2 break-all text-[11px] text-zinc-500">
                        Chave: {entry.access_key}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Produtos da NF
                  </p>
                  <ul className="space-y-2">
                    {items.map((item) => {
                      const missing = item.selected && (!item.matched_part_id || item.needs_mapping);
                      const busy = busyItemId === item.item_id;
                      return (
                        <li
                          key={item.item_id || item.line_number}
                          className={`rounded-2xl border-0 bg-white p-3.5 dark:bg-white/5 ${
                            !item.selected ? 'opacity-55' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => void toggleItem(item)}
                              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                item.selected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-zinc-200 text-zinc-500 dark:bg-white/10'
                              }`}
                              aria-label={item.selected ? 'Desmarcar item' : 'Marcar item'}
                            >
                              {item.selected ? <Check className="h-4 w-4" /> : null}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                                {item.description}
                              </p>
                              <p className="mt-0.5 text-[12px] text-zinc-500">
                                Código: {item.product_code || '—'}
                                {item.ean ? ` · EAN: ${item.ean}` : ''}
                                {item.ncm ? ` · NCM: ${item.ncm}` : ''}
                              </p>
                              <p className="mt-1 text-[13px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                                Qtd: {item.quantity} {item.unit || 'UN'} · {fmtMoney(item.total_price)}
                              </p>

                              {item.matched_part_id ? (
                                <p className="mt-2 text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
                                  Estoque: {item.matched_part_name}
                                  {item.match_method === 'ean'
                                    ? ' (EAN)'
                                    : item.match_method === 'product_code'
                                      ? ' (código)'
                                      : ''}
                                </p>
                              ) : (
                                <p className="mt-2 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                                  Produto não encontrado no estoque
                                </p>
                              )}

                              {missing ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setLinkItemId(item.item_id);
                                      setLinkQuery('');
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-[12px] font-semibold text-sky-900 dark:bg-sky-950/50 dark:text-sky-100"
                                  >
                                    <Link2 className="h-3.5 w-3.5" />
                                    Vincular a produto existente
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void createNewPart(item)}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                                  >
                                    {busy ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Plus className="h-3.5 w-3.5" />
                                    )}
                                    Cadastrar novo produto
                                  </button>
                                </div>
                              ) : null}

                              {linkItemId && linkItemId === item.item_id ? (
                                <div className="mt-3 rounded-xl bg-zinc-100 p-2.5 dark:bg-black/30">
                                  <input
                                    type="search"
                                    value={linkQuery}
                                    onChange={(e) => setLinkQuery(e.target.value)}
                                    placeholder="Buscar produto no estoque…"
                                    className="w-full rounded-lg border-0 bg-white px-3 py-2 text-[13px] outline-none dark:bg-zinc-900"
                                    autoFocus
                                  />
                                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                                    {linkCandidates.map((part) => (
                                      <li key={part.id}>
                                        <button
                                          type="button"
                                          onClick={() => void linkPart(item, part)}
                                          className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-white dark:hover:bg-white/10"
                                        >
                                          <span className="font-semibold text-zinc-900 dark:text-white">
                                            {part.name}
                                          </span>
                                          <span className="mt-0.5 block text-[11px] text-zinc-500">
                                            {[part.barcode, part.original_code].filter(Boolean).join(' · ') ||
                                              'Sem código'}
                                          </span>
                                        </button>
                                      </li>
                                    ))}
                                    {linkCandidates.length === 0 ? (
                                      <li className="px-2 py-2 text-[12px] text-zinc-500">
                                        Nenhum produto encontrado.
                                      </li>
                                    ) : null}
                                  </ul>
                                  <button
                                    type="button"
                                    onClick={() => setLinkItemId(null)}
                                    className="mt-1 text-[12px] font-semibold text-zinc-500"
                                  >
                                    Cancelar vínculo
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <p className="text-center text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">
                  Total de itens: {items.length} · Selecionados: {selectedCount}
                </p>
              </div>
            ) : null}
          </div>

          {phase === 'conference' ? (
            <footer className="flex shrink-0 gap-2 border-t border-zinc-200/60 px-5 py-3.5 dark:border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl bg-zinc-200 px-4 py-3.5 text-[15px] font-semibold text-zinc-900 dark:bg-white/10 dark:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={confirming || selectedCount <= 0}
                onClick={() => void handleConfirm()}
                className="inline-flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {confirming ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <PackagePlus className="h-5 w-5" />
                )}
                Confirmar entrada
              </button>
            </footer>
          ) : null}
        </div>
      </div>
    </RegistrationPortal>
  );
}
