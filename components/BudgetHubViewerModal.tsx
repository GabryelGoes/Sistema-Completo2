import React, { useEffect, useMemo, useState } from "react";
import { Eye, Printer, RefreshCw, X } from "lucide-react";
import { ModalPortal } from "./ui/ModalPortal";
import {
  budgetChronologicalNumber,
  budgetLastActivityMs,
  getServiceOrderBudgets,
  getServiceOrderById,
  isBudgetVerified,
  verifyServiceOrderBudget,
  type SavedBudgetFromApi,
  type ServiceOrderDetail,
} from "../services/apiService";
import { printBudgetMechanicWithDetail, printBudgetWithDetail } from "../utils/budgetPrintWithDetail";
import { DiagnosticAuthorizationSheetModal } from "./diagnostic/DiagnosticAuthorizationSheetModal";
import { getVehiclePhotoPublicUrl } from "../utils/vehicleStoragePublicUrl";
import { BudgetReadModalBody } from "./budget/BudgetReadModalBody";
import { BudgetVerificationPanel } from "./budget/BudgetVerificationPanel";
import { BudgetVerifiedSeal } from "./budget/BudgetVerifiedSeal";
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
  /** Admin ou usuário com acesso total. */
  canVerifyBudgets?: boolean;
  verifierDisplayName?: string;
}

export const BudgetHubViewerModal: React.FC<BudgetHubViewerModalProps> = ({
  serviceOrderId,
  budgetId,
  onClose,
  canVerifyBudgets = false,
  verifierDisplayName = "Administrador",
}) => {
  const [detail, setDetail] = useState<ServiceOrderDetail | null>(null);
  const [budgets, setBudgets] = useState<SavedBudgetFromApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [diagAuthSheetOpen, setDiagAuthSheetOpen] = useState(false);

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
  }, [serviceOrderId, budgetId]);

  const budget = useMemo(
    () => budgets.find((b) => b.id === budgetId) ?? null,
    [budgets, budgetId]
  );

  const isVerified = budget ? isBudgetVerified(budget) : false;

  const isModuleMode = detail?.order_type === "module";
  const mileageKm = detail?.mileage_km ?? null;

  const diagAuthSheetSrc = useMemo(() => {
    const p = detail?.diagnostic_authorization_signature_path;
    if (!p?.trim()) return null;
    return getVehiclePhotoPublicUrl(p);
  }, [detail?.diagnostic_authorization_signature_path]);

  const diagAuthSubtitleKm =
    mileageKm != null && String(mileageKm).trim() !== "" ? `Km ${String(mileageKm).trim()}` : null;

  const handleVerify = async () => {
    if (!budget || verifying) return;
    setVerifying(true);
    try {
      const updated = await verifyServiceOrderBudget(serviceOrderId, budget.id, {
        verifiedByName: verifierDisplayName,
      });
      setBudgets((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      window.dispatchEvent(new CustomEvent("rda-patio-budgets-changed"));
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Não foi possível verificar o orçamento.");
    } finally {
      setVerifying(false);
    }
  };

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
                <BudgetVerificationPanel
                  isVerified={isVerified}
                  verifiedAt={budget.verifiedAt}
                  verifiedByName={budget.verifiedByName}
                  canVerify={canVerifyBudgets}
                  verifying={verifying}
                  onVerify={() => void handleVerify()}
                  diagnosis={budget.diagnosis}
                  services={budget.services}
                  parts={budget.parts}
                />
                <BudgetReadModalBody
                  diagnosis={budget.diagnosis}
                  services={budget.services}
                  parts={budget.parts}
                  observations={budget.observations}
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
    </ModalPortal>
  );
};
