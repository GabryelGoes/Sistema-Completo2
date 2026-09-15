import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2,
  PackageMinus,
  PackagePlus,
  Pencil,
  QrCode,
  ShoppingCart,
  X,
} from 'lucide-react';
import {
  lookupWorkshopAbsModuleByCode,
  lookupWorkshopPartByCode,
  type WorkshopPart,
} from '../services/apiService';
import {
  ABS_MODULE_CONDITION_OPTIONS,
  ABS_MODULE_KIND_OPTIONS,
  ABS_MODULE_STATUS_OPTIONS,
  looksLikeAbsModuleCode,
  normalizeAbsModuleCode,
  type WorkshopAbsModule,
} from '../utils/workshopAbsModules';
import { storageSiteLabel } from '../utils/workshopPartFields';
import {
  formatWorkshopPartQty,
  getWorkshopPartStockStatus,
} from '../utils/workshopPartStock';
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
  /** Código vindo da pistola USB / leitura externa — troca o produto exibido. */
  externalScanCode?: string | null;
  /** Token crescente para permitir reler o mesmo código. */
  externalScanToken?: number | null;
  /** Confirma que o código externo foi consumido (evita reprocessar). */
  onExternalScanConsumed?: () => void;
  /** Abre a página real de edição do produto. */
  onEditProduct: (part: WorkshopPart) => void;
  /** Recebimento / reposição de estoque. */
  onStockEntry: (part: WorkshopPart) => void;
  /** Cadastro novo com código pré-preenchido. */
  onRegisterProduct: (barcode: string) => void;
  /** Saída comercial (venda). */
  onSaleOutbound: (part: WorkshopPart) => void;
  /** Saída por consumo interno (oficina). */
  onConsumableOutbound: (part: WorkshopPart) => void;
  /** Abre inventário completo do módulo ABS. */
  onOpenAbsModule: (publicId: string, found: boolean) => void;
};

type ResolvedState =
  | { kind: 'idle' }
  | { kind: 'part'; code: string; part: WorkshopPart }
  | { kind: 'missing_part'; code: string }
  | { kind: 'abs'; code: string; module: WorkshopAbsModule }
  | { kind: 'missing_abs'; code: string };

function fmtMoney(n: number | null | undefined): string {
  return `R$ ${Number(n ?? 0).toFixed(2)}`;
}

function absKindLabel(v: string): string {
  return ABS_MODULE_KIND_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
function absConditionLabel(v: string): string {
  return ABS_MODULE_CONDITION_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
function absStatusLabel(v: string): string {
  return ABS_MODULE_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

/**
 * Leitura de código (câmera / pistola / digitação) → visualização rápida do item.
 * Nova leitura troca o produto/módulo exibido sem fechar o modal.
 */
export function WorkshopPartScanHubModal({
  isOpen,
  onClose,
  catalogParts = [],
  externalScanCode = null,
  externalScanToken = null,
  onExternalScanConsumed,
  onEditProduct,
  onStockEntry,
  onRegisterProduct,
  onSaleOutbound,
  onConsumableOutbound,
  onOpenAbsModule,
}: WorkshopPartScanHubModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [code, setCode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedState>({ kind: 'idle' });
  const lastExternalTokenRef = useRef<number | null>(null);
  const lookupSeqRef = useRef(0);

  useBrowserBackLayer(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setCode('');
    setError(null);
    setResolved({ kind: 'idle' });
    setLookingUp(false);
    lastExternalTokenRef.current = null;
    lookupSeqRef.current = 0;
  }, [isOpen]);

  /** Mantém qty/estoque alinhados ao catálogo após baixas. */
  useEffect(() => {
    if (resolved.kind !== 'part' || catalogParts.length === 0) return;
    const fresh = catalogParts.find((p) => p.id === resolved.part.id);
    if (!fresh) return;
    if (
      fresh.stock_qty === resolved.part.stock_qty &&
      fresh.unit_price === resolved.part.unit_price &&
      fresh.name === resolved.part.name &&
      fresh.photo_url === resolved.part.photo_url
    ) {
      return;
    }
    setResolved({ kind: 'part', code: resolved.code, part: fresh });
  }, [catalogParts, resolved]);

  const handleSubmitCode = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const seq = ++lookupSeqRef.current;
    setLookingUp(true);
    setError(null);
    try {
      if (looksLikeAbsModuleCode(trimmed)) {
        const publicId = normalizeAbsModuleCode(trimmed);
        if (!publicId) {
          if (seq !== lookupSeqRef.current) return;
          setError('ID de módulo ABS inválido. Use o formato ABS-000001.');
          return;
        }
        const result = await lookupWorkshopAbsModuleByCode(publicId);
        if (seq !== lookupSeqRef.current) return;
        if (result.found && result.module) {
          setResolved({ kind: 'abs', code: publicId, module: result.module });
        } else {
          setResolved({ kind: 'missing_abs', code: publicId });
        }
        return;
      }

      const found = await lookupWorkshopPartByCode(trimmed);
      if (seq !== lookupSeqRef.current) return;
      if (found) setResolved({ kind: 'part', code: trimmed, part: found });
      else setResolved({ kind: 'missing_part', code: trimmed });
    } catch (e) {
      if (seq !== lookupSeqRef.current) return;
      setError(e instanceof Error ? e.message : 'Falha ao consultar o código.');
    } finally {
      if (seq === lookupSeqRef.current) setLookingUp(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !externalScanCode || externalScanToken == null) return;
    if (lastExternalTokenRef.current === externalScanToken) return;
    lastExternalTokenRef.current = externalScanToken;
    setCode('');
    void handleSubmitCode(externalScanCode);
    onExternalScanConsumed?.();
  }, [externalScanCode, externalScanToken, handleSubmitCode, isOpen, onExternalScanConsumed]);

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);
  const hasResult = resolved.kind !== 'idle';
  const showingPart = resolved.kind === 'part';

  return (
    <RegistrationPortal>
      <div
        className={overlayClass}
        role="dialog"
        aria-modal="true"
        aria-label="Produto identificado"
        onClick={onClose}
      >
        <div
          className={`flex w-full flex-col overflow-hidden rounded-[1.75rem] border-0 bg-zinc-50 shadow-none dark:bg-zinc-950 ${
            isDesktopShell
              ? showingPart
                ? 'max-h-[min(720px,92vh)] max-w-5xl'
                : 'max-h-[min(640px,90vh)] max-w-3xl'
              : 'max-h-[min(920px,94vh)] max-w-lg'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <header
            className={`flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200/60 dark:border-white/[0.08] ${
              isDesktopShell ? 'px-6 py-3.5' : 'px-5 py-4'
            }`}
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                Estoque de peças
              </p>
              <h2
                className={`font-bold text-zinc-900 dark:text-white ${
                  isDesktopShell ? 'text-[20px]' : 'text-[18px]'
                }`}
              >
                {hasResult ? 'Item identificado' : 'Leitura de código'}
              </h2>
              <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                {hasResult
                  ? 'Leia outro código para trocar o item exibido.'
                  : 'Pistola USB, câmera ou digitação — peças e módulos ABS.'}
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

          <div
            className={`min-h-0 flex-1 ${
              isDesktopShell && showingPart
                ? 'overflow-hidden px-6 py-4'
                : `overflow-y-auto ${isDesktopShell ? 'px-6 py-4' : 'px-5 py-4'}`
            } ${isDesktopShell && showingPart ? 'flex flex-col gap-3' : 'space-y-4'}`}
          >
            <BarcodeScanField
              value={code}
              onChange={setCode}
              onSubmitCode={handleSubmitCode}
              disabled={lookingUp}
              autoFocus
              placeholder="Código de barras ou ABS-000001…"
              className={isDesktopShell ? 'shrink-0' : undefined}
            />

            {lookingUp ? (
              <div className="flex items-center justify-center gap-2 py-4 text-[14px] text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Consultando…
              </div>
            ) : null}

            {error ? (
              <p className="rounded-xl border-0 bg-red-50 px-3 py-2.5 text-[13px] text-red-800 shadow-none dark:bg-red-950/40 dark:text-red-200">
                {error}
              </p>
            ) : null}

            {resolved.kind === 'part' ? (
              <PartQuickCard
                part={resolved.part}
                scannedCode={resolved.code}
                desktopLayout={isDesktopShell}
                onEdit={() => {
                  onEditProduct(resolved.part);
                  onClose();
                }}
                onStockEntry={() => {
                  onStockEntry(resolved.part);
                  onClose();
                }}
                onSale={() => {
                  onSaleOutbound(resolved.part);
                  onClose();
                }}
                onConsumable={() => {
                  onConsumableOutbound(resolved.part);
                  onClose();
                }}
              />
            ) : null}

            {resolved.kind === 'missing_part' ? (
              <div className="space-y-3">
                <div className="rounded-2xl border-0 bg-amber-50 p-4 shadow-none dark:bg-amber-950/35">
                  <p className="text-[14px] font-semibold text-amber-950 dark:text-amber-100">
                    Código não cadastrado
                  </p>
                  <p className="mt-1 text-[13px] text-amber-900/80 dark:text-amber-200/80">
                    <span className="font-mono font-semibold">{resolved.code}</span>
                    {' — '}cadastre o produto para liberar movimentações.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onRegisterProduct(resolved.code);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border-0 bg-emerald-600 px-4 py-3.5 text-left text-white shadow-none transition hover:bg-emerald-500"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                    <PackagePlus className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">Cadastrar produto</span>
                    <span className="block text-[12px] text-white/80">Abrir ficha com este código</span>
                  </span>
                </button>
              </div>
            ) : null}

            {resolved.kind === 'abs' ? (
              <AbsQuickCard
                module={resolved.module}
                onOpenInventory={() => {
                  onOpenAbsModule(resolved.module.public_id, true);
                  onClose();
                }}
              />
            ) : null}

            {resolved.kind === 'missing_abs' ? (
              <div className="space-y-3">
                <div className="rounded-2xl border-0 bg-amber-50 p-4 shadow-none dark:bg-amber-950/35">
                  <p className="text-[14px] font-semibold text-amber-950 dark:text-amber-100">
                    Módulo ABS não cadastrado
                  </p>
                  <p className="mt-1 text-[13px] text-amber-900/80 dark:text-amber-200/80">
                    <span className="font-mono font-semibold">{resolved.code}</span>
                    {' — '}abra o inventário para registrar este QR.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onOpenAbsModule(resolved.code, false);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border-0 bg-indigo-600 px-4 py-3.5 text-left text-white shadow-none transition hover:bg-indigo-500"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                    <QrCode className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">Abrir inventário ABS</span>
                    <span className="block text-[12px] text-white/80">Cadastrar módulo com este QR</span>
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </RegistrationPortal>
  );
}

function PartQuickCard({
  part,
  scannedCode,
  desktopLayout = false,
  onEdit,
  onStockEntry,
  onSale,
  onConsumable,
}: {
  part: WorkshopPart;
  scannedCode: string;
  desktopLayout?: boolean;
  onEdit: () => void;
  onStockEntry: () => void;
  onSale: () => void;
  onConsumable: () => void;
}) {
  const stockStatus = getWorkshopPartStockStatus(part);
  const qty = formatWorkshopPartQty(part.stock_qty);
  const unit = part.unit_of_measure || 'UN';
  const codeLine =
    [part.barcode, part.original_code, part.numeric_code].filter(Boolean).join(' · ') || scannedCode;
  const stockTone =
    stockStatus === 'zero'
      ? 'bg-red-600 text-white'
      : stockStatus === 'low'
        ? 'bg-amber-500 text-amber-950'
        : 'bg-emerald-600 text-white';
  const stockHint =
    stockStatus === 'zero' ? 'Sem saldo' : stockStatus === 'low' ? 'Abaixo do mínimo' : 'Saldo ok';

  const photo = (
    <div
      className={`relative shrink-0 overflow-hidden bg-gradient-to-br from-zinc-100 via-zinc-50 to-emerald-50/40 dark:from-zinc-800 dark:via-zinc-900 dark:to-emerald-950/30 ${
        desktopLayout
          ? 'h-[7.5rem] w-[7.5rem] rounded-[1.35rem] ring-1 ring-black/[0.04] dark:ring-white/[0.08]'
          : 'h-20 w-20 rounded-xl'
      }`}
    >
      {part.photo_url ? (
        <>
          <PartPhotoImg
            src={part.photo_url}
            alt=""
            className={`h-full w-full object-cover ${desktopLayout ? 'scale-[1.02]' : ''}`}
          />
          {desktopLayout ? (
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/25"
              aria-hidden
            />
          ) : null}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-zinc-400">
          Sem foto
        </div>
      )}
    </div>
  );

  const meta = (
    <div className="min-w-0 flex-1">
      <div className={`flex items-start gap-2 ${desktopLayout ? 'gap-3' : ''}`}>
        <p
          className={`min-w-0 flex-1 font-bold leading-snug text-zinc-900 dark:text-white ${
            desktopLayout ? 'text-[18px]' : 'text-[16px]'
          }`}
        >
          {part.name}
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] font-medium text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200"
          title="Editar cadastro"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
          Editar
        </button>
      </div>
      <p className="mt-1 truncate text-[13px] text-zinc-500 dark:text-zinc-400">
        {[part.brand, part.model].filter(Boolean).join(' · ') || '—'}
      </p>
      <p className="mt-1 truncate font-mono text-[12px] text-zinc-600 dark:text-zinc-300">{codeLine}</p>
    </div>
  );

  const stockBanner = (
    <div className={`rounded-2xl px-4 py-3.5 ${stockTone} ${desktopLayout ? 'py-4' : ''}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-90">Quantidade em estoque</p>
      <p
        className={`mt-1 font-bold tabular-nums leading-none tracking-tight ${
          desktopLayout ? 'text-[2.35rem]' : 'text-[2rem]'
        }`}
      >
        {qty}
        <span className="ml-2 text-[1rem] font-semibold opacity-90">{unit}</span>
      </p>
      <p className="mt-2 text-[12px] font-semibold opacity-90">{stockHint}</p>
    </div>
  );

  const details = (
    <div className={`grid grid-cols-2 gap-x-4 gap-y-2.5 ${desktopLayout ? 'gap-y-3' : ''}`}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Local</p>
        <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
          {[storageSiteLabel(part.storage_site), part.location].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Preço unitário</p>
        <p className="text-[13px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
          {fmtMoney(part.unit_price)}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Mínimo</p>
        <p className="text-[13px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
          {formatWorkshopPartQty(part.min_stock_qty)} {unit}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">NCM / origem fiscal</p>
        <p className="truncate text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
          {[part.ncm_code, part.fiscal_origin].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
    </div>
  );

  const actions = (
    <div className={`space-y-2 ${desktopLayout ? 'flex h-full flex-col justify-center space-y-2.5' : ''}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
        Movimentações
      </p>
      <ActionButton
        tone="emerald"
        compact={desktopLayout}
        icon={<PackagePlus className="h-5 w-5" />}
        title="Registrar recebimento"
        subtitle="Entrada, compra ou reposição de saldo"
        onClick={onStockEntry}
      />
      <ActionButton
        tone="violet"
        compact={desktopLayout}
        icon={<ShoppingCart className="h-5 w-5" />}
        title="Registrar venda"
        subtitle="Saída comercial avulsa ao cliente"
        onClick={onSale}
      />
      <ActionButton
        tone="sky"
        compact={desktopLayout}
        icon={<PackageMinus className="h-5 w-5" />}
        title="Registrar consumo"
        subtitle="Saída operacional / uso interno na oficina"
        onClick={onConsumable}
      />
    </div>
  );

  if (desktopLayout) {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.9fr)] gap-4 overflow-hidden">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-2xl border-0 bg-white p-4 shadow-none dark:bg-white/5">
          <div className="flex items-start gap-4">
            {photo}
            {meta}
          </div>
          {stockBanner}
          <div className="border-t border-zinc-100 pt-3 dark:border-white/[0.06]">{details}</div>
        </div>
        <div className="min-h-0 overflow-hidden rounded-2xl border-0 bg-white p-4 shadow-none dark:bg-white/5">
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border-0 bg-white shadow-none dark:bg-white/5">
        <div className="flex gap-3 p-4">
          {photo}
          {meta}
        </div>
        <div className="mx-4 mb-4">{stockBanner}</div>
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-white/[0.06]">{details}</div>
      </div>
      {actions}
    </div>
  );
}

function AbsQuickCard({
  module,
  onOpenInventory,
}: {
  module: WorkshopAbsModule;
  onOpenInventory: () => void;
}) {
  const available = module.status === 'disponivel';
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border-0 bg-white shadow-none dark:bg-white/5">
        <div className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
            Módulo ABS
          </p>
          <p className="mt-1 font-mono text-[22px] font-bold tracking-tight text-zinc-900 dark:text-white">
            {module.public_id}
          </p>
          <p className="mt-1 text-[14px] font-semibold text-zinc-700 dark:text-zinc-200">
            {[module.manufacturer, module.model].filter(Boolean).join(' · ') || 'Sem fabricante/modelo'}
          </p>
        </div>
        <div
          className={`mx-4 mb-4 rounded-2xl px-4 py-4 ${
            available ? 'bg-emerald-600 text-white' : 'bg-zinc-700 text-white'
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-90">Situação no inventário</p>
          <p className="mt-1 text-[1.75rem] font-bold leading-none tracking-tight">
            {absStatusLabel(module.status)}
          </p>
          <p className="mt-2 text-[12px] font-semibold opacity-90">
            {absKindLabel(module.module_kind)} · {absConditionLabel(module.condition)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-zinc-100 px-4 py-3 dark:border-white/[0.06]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Local</p>
            <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
              {module.location || '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Código original</p>
            <p className="truncate text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
              {module.original_code || '—'}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Aplicação</p>
            <p className="truncate text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
              {module.application || '—'}
            </p>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenInventory}
        className="flex w-full items-center gap-3 rounded-2xl border-0 bg-indigo-600 px-4 py-3.5 text-left text-white shadow-none transition hover:bg-indigo-500"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <QrCode className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">Abrir inventário do módulo</span>
          <span className="block text-[12px] text-white/80">Entrada, saída, transferência e etiqueta</span>
        </span>
      </button>
    </div>
  );
}

function ActionButton({
  tone,
  icon,
  title,
  subtitle,
  onClick,
  compact = false,
}: {
  tone: 'emerald' | 'violet' | 'sky';
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  compact?: boolean;
}) {
  const tones = {
    emerald: {
      row: 'bg-emerald-50 hover:bg-emerald-100/90 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50',
      icon: 'bg-emerald-600 text-white',
      title: 'text-emerald-950 dark:text-emerald-100',
      sub: 'text-emerald-800/80 dark:text-emerald-200/75',
    },
    violet: {
      row: 'bg-violet-50 hover:bg-violet-100/90 dark:bg-violet-950/40 dark:hover:bg-violet-900/50',
      icon: 'bg-violet-600 text-white',
      title: 'text-violet-950 dark:text-violet-100',
      sub: 'text-violet-800/80 dark:text-violet-200/75',
    },
    sky: {
      row: 'bg-sky-50 hover:bg-sky-100/90 dark:bg-sky-950/40 dark:hover:bg-sky-900/50',
      icon: 'bg-sky-600 text-white',
      title: 'text-sky-950 dark:text-sky-100',
      sub: 'text-sky-800/80 dark:text-sky-200/75',
    },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border-0 text-left shadow-none transition ${tones.row} ${
        compact ? 'px-3.5 py-3' : 'px-4 py-3.5'
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones.icon}`}>{icon}</span>
      <span className="min-w-0">
        <span className={`block text-[15px] font-semibold ${tones.title}`}>{title}</span>
        <span className={`block text-[12px] ${tones.sub}`}>{subtitle}</span>
      </span>
    </button>
  );
}
