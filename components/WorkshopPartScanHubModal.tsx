import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  PackageMinus,
  PackagePlus,
  ShoppingCart,
  X,
} from 'lucide-react';
import {
  lookupWorkshopAbsModuleByCode,
  lookupWorkshopPartByCode,
  type WorkshopPart,
} from '../services/apiService';
import {
  looksLikeAbsModuleCode,
  normalizeAbsModuleCode,
} from '../utils/workshopAbsModules';
import { formatWorkshopPartQty } from '../utils/workshopPartStock';
import { BarcodeScanField } from './BarcodeScanField';
import { PartPhotoImg } from './ui/PartPhotoImg';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { resolveIosModalOverlayClass, NESTED_STOCK_OVERLAY_Z } from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type WorkshopPartScanHubModalProps = {
  isOpen: boolean;
  onClose: () => void;
  catalogParts?: WorkshopPart[];
  /** Abre edição do produto para registrar entrada / reposição. */
  onStockEntry: (part: WorkshopPart) => void;
  /** Cadastro novo com código pré-preenchido. */
  onRegisterProduct: (barcode: string) => void;
  /** Baixa por venda comercial. */
  onSaleOutbound: (part: WorkshopPart) => void;
  /** Baixa por consumo interno (oficina). */
  onConsumableOutbound: (part: WorkshopPart) => void;
  /** Código ABS-###### → inventário de módulos. */
  onAbsModuleCode: (publicId: string, found: boolean) => void;
};

/**
 * Hub único de leitura: câmera / pistola / digitação.
 * Após identificar o código, sugere as ações de estoque.
 */
export function WorkshopPartScanHubModal({
  isOpen,
  onClose,
  catalogParts = [],
  onStockEntry,
  onRegisterProduct,
  onSaleOutbound,
  onConsumableOutbound,
  onAbsModuleCode,
}: WorkshopPartScanHubModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [code, setCode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedCode, setResolvedCode] = useState<string | null>(null);
  const [part, setPart] = useState<WorkshopPart | null>(null);

  useBrowserBackLayer(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setCode('');
    setError(null);
    setResolvedCode(null);
    setPart(null);
    setLookingUp(false);
  }, [isOpen]);

  /** Mantém snapshot alinhado ao catálogo após baixas. */
  useEffect(() => {
    if (!part?.id || catalogParts.length === 0) return;
    const fresh = catalogParts.find((p) => p.id === part.id);
    if (fresh) setPart(fresh);
  }, [catalogParts, part?.id]);

  const resetToScan = useCallback(() => {
    setCode('');
    setError(null);
    setResolvedCode(null);
    setPart(null);
  }, []);

  const handleSubmitCode = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      setLookingUp(true);
      setError(null);
      try {
        if (looksLikeAbsModuleCode(trimmed)) {
          const publicId = normalizeAbsModuleCode(trimmed);
          if (!publicId) {
            setError('ID de módulo ABS inválido. Use o formato ABS-000001.');
            return;
          }
          const result = await lookupWorkshopAbsModuleByCode(publicId);
          onAbsModuleCode(publicId, !!result.found);
          onClose();
          return;
        }

        const found = await lookupWorkshopPartByCode(trimmed);
        setResolvedCode(trimmed);
        setPart(found);
        if (!found) {
          setError(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao consultar o código.');
        setResolvedCode(null);
        setPart(null);
      } finally {
        setLookingUp(false);
      }
    },
    [onAbsModuleCode, onClose],
  );

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);
  const showingActions = Boolean(resolvedCode);

  return (
    <RegistrationPortal>
      <div
        className={overlayClass}
        role="dialog"
        aria-modal="true"
        aria-label="Leitura de código"
        onClick={onClose}
      >
        <div
          className="flex max-h-[min(920px,94vh)] w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] border-0 bg-zinc-50 shadow-none dark:bg-zinc-950"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200/60 px-5 py-4 dark:border-white/[0.08]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                Estoque
              </p>
              <h2 className="text-[18px] font-bold text-zinc-900 dark:text-white">
                {showingActions ? 'Ações do código' : 'Leitura de código'}
              </h2>
              <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                {showingActions
                  ? 'Escolha a operação para este item.'
                  : 'Use a câmera, pistola USB ou digite o código.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-700 transition hover:bg-zinc-300 dark:bg-white/10 dark:text-zinc-200"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {!showingActions ? (
              <>
                <BarcodeScanField
                  value={code}
                  onChange={setCode}
                  onSubmitCode={handleSubmitCode}
                  disabled={lookingUp}
                  autoFocus
                  placeholder="Código de barras, ABS-000001…"
                />
                {lookingUp ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-[14px] text-zinc-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Consultando…
                  </div>
                ) : null}
                {error ? (
                  <p className="rounded-xl border-0 bg-red-50 px-3 py-2.5 text-[13px] text-red-800 shadow-none dark:bg-red-950/40 dark:text-red-200">
                    {error}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={resetToScan}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Ler outro código
                </button>

                {part ? (
                  <div className="flex items-center gap-3 rounded-2xl border-0 bg-white p-3 shadow-none dark:bg-white/5">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                      {part.photo_url ? (
                        <PartPhotoImg
                          src={part.photo_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-zinc-400">
                          Sem foto
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-zinc-900 dark:text-white">
                        {part.name}
                      </p>
                      <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                        {[part.brand, part.original_code || part.numeric_code || part.barcode]
                          .filter(Boolean)
                          .join(' · ') || resolvedCode}
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                        Estoque: {formatWorkshopPartQty(part.stock_qty)} {part.unit_of_measure || 'UN'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border-0 bg-amber-50 p-4 shadow-none dark:bg-amber-950/35">
                    <p className="text-[14px] font-semibold text-amber-950 dark:text-amber-100">
                      Código não cadastrado
                    </p>
                    <p className="mt-1 text-[13px] text-amber-900/80 dark:text-amber-200/80">
                      <span className="font-mono font-semibold">{resolvedCode}</span>
                      {' — '}registre o produto para liberar as baixas de estoque.
                    </p>
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  {part ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onStockEntry(part);
                          onClose();
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl border-0 bg-emerald-50 px-4 py-3.5 text-left shadow-none transition hover:bg-emerald-100/90 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                          <PackagePlus className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-emerald-950 dark:text-emerald-100">
                            Entrada de estoque
                          </span>
                          <span className="block text-[12px] text-emerald-800/80 dark:text-emerald-200/75">
                            Reposição, compra ou ajuste de quantidade
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onSaleOutbound(part);
                          onClose();
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl border-0 bg-violet-50 px-4 py-3.5 text-left shadow-none transition hover:bg-violet-100/90 dark:bg-violet-950/40 dark:hover:bg-violet-900/50"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
                          <ShoppingCart className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-violet-950 dark:text-violet-100">
                            Baixa por venda
                          </span>
                          <span className="block text-[12px] text-violet-800/80 dark:text-violet-200/75">
                            Venda comercial avulsa ao cliente
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onConsumableOutbound(part);
                          onClose();
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl border-0 bg-sky-50 px-4 py-3.5 text-left shadow-none transition hover:bg-sky-100/90 dark:bg-sky-950/40 dark:hover:bg-sky-900/50"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
                          <PackageMinus className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-sky-950 dark:text-sky-100">
                            Baixa por consumo interno
                          </span>
                          <span className="block text-[12px] text-sky-800/80 dark:text-sky-200/75">
                            Uso em serviço, oficina ou insumos
                          </span>
                        </span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (resolvedCode) onRegisterProduct(resolvedCode);
                        onClose();
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl border-0 bg-emerald-600 px-4 py-3.5 text-left text-white shadow-none transition hover:bg-emerald-500"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                        <PackagePlus className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold">Cadastrar no estoque</span>
                        <span className="block text-[12px] text-white/80">
                          Criar produto com este código
                        </span>
                      </span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </RegistrationPortal>
  );
}
