import React, { useEffect, useMemo, useState } from "react";
import { Calculator, CheckCircle2, Eye, Printer, RefreshCw, X, ArrowRightCircle } from "lucide-react";
import { ModalPortal } from "./ui/ModalPortal";
import {
  budgetChronologicalNumber,
  budgetLastActivityMs,
  getServiceOrderBudgets,
  getServiceOrderById,
  isBudgetVerified,
  updateServiceOrderStatus,
  type SavedBudgetFromApi,
  type ServiceOrderDetail,
  type ServiceOrderUpdateActor,
} from "../services/apiService";
import { printBudgetMechanicWithDetail, printBudgetWithDetail } from "../utils/budgetPrintWithDetail";
import { DiagnosticAuthorizationSheetModal } from "./diagnostic/DiagnosticAuthorizationSheetModal";
import { getVehiclePhotoPublicUrl } from "../utils/vehicleStoragePublicUrl";
import { BudgetReadModalBody } from "./budget/BudgetReadModalBody";
import { BudgetVerifiedSeal } from "./budget/BudgetVerifiedSeal";
import { BudgetApprovalModal } from "./budget/BudgetApprovalModal";
import {
  budgetReadFooterBtnClass,
  budgetReadFooterPrimaryClass,
  budgetReadModalBackdropClass,
  budgetReadModalFooterClass,
  budgetReadModalHeaderClass,
  budgetReadModalScrollClass,
  budgetReadModalShellClass,
} from "./budget/budgetReadModalTheme";

export interface BudgetHubViewerModalProps {
  serviceOrderId: string;
  budgetId: string;
  onClose: () => void;
  canApproveBudgetItems?: boolean;
  actorOptions?: ServiceOrderUpdateActor;
}

export const BudgetHubViewerModal: React.FC<BudgetHubViewerModalProps> = ({
  serviceOrderId,
  budgetId,
  onClose,
  canApproveBudgetItems = false,
  actorOptions,
}) => {
  const [detail, setDetail] = useState<ServiceOrderDetail | null>(null);
  const [budgets, setBudgets] = useState<SavedBudgetFromApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [diagAuthSheetOpen, setDiagAuthSheetOpen] = useState(false);
  const [markingApproved, setMarkingApproved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setBudgets([]);
    void (async () => {
      try {
        const [d, list] = await Promise.all([
          getServiceOrderById(serviceOrderId),
          getServiceOrderBudgets(serviceOrderId),
        ]);
        if (cancelled) return;
        setDetail(d);
        setBudgets(list);
      } catch (e: unknown) {
        if (!cancelled) {
          setError((e as Error)?.message ?? "Não foi possível carregar o orçamento.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceOrderId, budgetId]);

  useEffect(() => {
    setDiagAuthSheetOpen(false);
    setApprovalOpen(false);
  }, [serviceOrderId, budgetId]);

  const budget = useMemo(
    () => budgets.find((b) => b.id === budgetId) ?? null,
    [budgets, budgetId]
  );

  const isVerified = budget ? isBudgetVerified(budget) : false;

  const isModuleMode = detail?.order_type === "module";
  const mileageKm = detail?.mileage_km ?? null;

  const hasApprovedItems = useMemo(() => {
    if (!budget) return false;
    return (
      budget.services.some((s) => s.approved === true) || budget.parts.some((p) => p.approved === true)
    );
  }, [budget]);

  const canMarkOrderBudgetApproved =
    Boolean(detail) &&
    detail?.status === "AGUARDANDO_APROVACAO" &&
    hasApprovedItems &&
    canApproveBudgetItems;

  const handleMarkOrderBudgetApproved = async () => {
    if (!detail || !canMarkOrderBudgetApproved) return;
    if (
      !window.confirm(
        "Confirmar que o cliente aprovou o orçamento? A OS será movida para Orçamento aprovado."
      )
    ) {
      return;
    }
    setMarkingApproved(true);
    try {
      const updated = await updateServiceOrderStatus(serviceOrderId, "ORCAMENTO_APROVADO", actorOptions);
      setDetail((prev) => (prev ? { ...prev, status: updated.status } : prev));
      window.dispatchEvent(new CustomEvent("rda-patio-budgets-changed"));
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Não foi possível atualizar a etapa da OS.");
    } finally {
      setMarkingApproved(false);
    }
  };

  const diagAuthSheetSrc = useMemo(() => {
    const p = detail?.diagnostic_authorization_signature_path;
    if (!p?.trim()) return null;
    return getVehiclePhotoPublicUrl(p);
  }, [detail?.diagnostic_authorization_signature_path]);

  const diagAuthSubtitleKm =
    mileageKm != null && String(mileageKm).trim() !== "" ? `Km ${String(mileageKm).trim()}` : null;

  return (
    <ModalPortal>
      <div className={budgetReadModalBackdropClass}>
        <div className={budgetReadModalShellClass} style={{ colorScheme: "light" }}>
          <div className={budgetReadModalHeaderClass}>
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {loading ? "Orçamento" : budget ? `Orçamento ${budgetChronologicalNumber(budgets, budget.id)}` : "Orçamento"}
                </h2>
                {!loading && budget && isVerified ? (
                  <BudgetVerifiedSeal
                    verifiedAt={budget.verifiedAt}
                    verifiedByName={budget.verifiedByName}
                  />
                ) : null}
              </div>
              {!loading && budget ? (
                <p className="mt-0.5 text-sm font-medium text-slate-600">
                  {new Date(budgetLastActivityMs(budget)).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              ) : null}
              {!loading && mileageKm ? (
                <p className="mt-1 text-sm font-medium text-slate-600">
                  <span className="font-semibold text-slate-800">Km</span> {mileageKm}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-sky-100 hover:text-slate-900"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-slate-600">
                <RefreshCw className="h-8 w-8 animate-spin opacity-70" />
                <p className="text-sm font-medium">Carregando orçamento…</p>
              </div>
            ) : error ? (
              <div className="p-6 text-sm font-medium text-red-700">{error}</div>
            ) : !budget ? (
              <div className="p-6 text-sm font-medium text-slate-700">Orçamento não encontrado.</div>
            ) : (
              <div className={budgetReadModalScrollClass}>
                <BudgetReadModalBody
                  diagnosis={budget.diagnosis}
                  services={budget.services}
                  parts={budget.parts}
                  observations={budget.observations}
                  showInternalFields
                />
              </div>
            )}

            {!loading && !error && budget ? (
              <div className={budgetReadModalFooterClass}>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {!isModuleMode && diagAuthSheetSrc ? (
                    <button
                      type="button"
                      onClick={() => setDiagAuthSheetOpen(true)}
                      className={budgetReadFooterBtnClass}
                    >
                      <Eye className="h-4 w-4" /> Ver autorização
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => printBudgetWithDetail(budget, detail, { isModuleMode, mileageKm })}
                    className={budgetReadFooterBtnClass}
                  >
                    <Printer className="h-4 w-4" /> Imprimir
                  </button>
                  <button
                    type="button"
                    onClick={() => printBudgetMechanicWithDetail(budget, detail, { isModuleMode, mileageKm })}
                    className={budgetReadFooterBtnClass}
                  >
                    <Printer className="h-4 w-4" /> Via mecânico
                  </button>
                  {canApproveBudgetItems &&
                  (budget.services.length > 0 || budget.parts.length > 0) ? (
                    <button
                      type="button"
                      onClick={() => setApprovalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-brand-yellow/50 bg-brand-yellow/10 px-5 py-2.5 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-brand-yellow/20"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Aprovar itens
                    </button>
                  ) : null}
                  {canMarkOrderBudgetApproved ? (
                    <button
                      type="button"
                      onClick={() => void handleMarkOrderBudgetApproved()}
                      disabled={markingApproved}
                      className="inline-flex items-center gap-2 rounded-xl border border-orange-500/50 bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:opacity-55"
                    >
                      <ArrowRightCircle className="h-4 w-4" />
                      {markingApproved ? "Atualizando…" : "Orçamento aprovado"}
                    </button>
                  ) : null}
                  <button type="button" onClick={onClose} className={budgetReadFooterPrimaryClass}>
                    Fechar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {diagAuthSheetOpen && diagAuthSheetSrc && detail ? (
        <DiagnosticAuthorizationSheetModal
          open
          onClose={() => setDiagAuthSheetOpen(false)}
          signatureImageSrc={diagAuthSheetSrc}
          signedAt={detail.diagnostic_authorization_signed_at ?? null}
          subtitleExtra={diagAuthSubtitleKm}
        />
      ) : null}

      <BudgetApprovalModal
        open={approvalOpen}
        budget={budget}
        serviceOrderId={serviceOrderId}
        onClose={() => setApprovalOpen(false)}
        onSaved={(updated) => {
          setBudgets((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
        }}
        actorOptions={actorOptions}
        headerIcon={<Calculator className="h-5 w-5" />}
      />
    </ModalPortal>
  );
};
