import React, { useEffect, useMemo, useState } from "react";
import { Check, Printer, RefreshCw, X } from "lucide-react";
import { ModalPortal } from "./ui/ModalPortal";
import {
  budgetChronologicalNumber,
  budgetLastActivityMs,
  getServiceOrderBudgets,
  getServiceOrderById,
  type SavedBudgetFromApi,
  type ServiceOrderDetail,
} from "../services/apiService";
import { budgetHasExplicitApprovalDecisions, budgetReadRowClass } from "../utils/budgetItemDisplay";
import { printBudgetMechanicWithDetail, printBudgetWithDetail } from "../utils/budgetPrintWithDetail";
import { formatLaborLabel } from "../utils/workshopLaborFormat";
import { DiagnosticAuthorizationRecordPanel } from "./diagnostic/DiagnosticAuthorizationRecordPanel";

export interface BudgetHubViewerModalProps {
  serviceOrderId: string;
  budgetId: string;
  onClose: () => void;
}

export const BudgetHubViewerModal: React.FC<BudgetHubViewerModalProps> = ({
  serviceOrderId,
  budgetId,
  onClose,
}) => {
  const [detail, setDetail] = useState<ServiceOrderDetail | null>(null);
  const [budgets, setBudgets] = useState<SavedBudgetFromApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const budget = useMemo(
    () => budgets.find((b) => b.id === budgetId) ?? null,
    [budgets, budgetId]
  );

  const approvalContrast = useMemo(
    () => (budget ? budgetHasExplicitApprovalDecisions(budget.services, budget.parts) : false),
    [budget]
  );

  const isModuleMode = detail?.order_type === "module";
  const mileageKm = detail?.mileage_km ?? null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] animate-modal-backdrop">
        <div
          className="relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-lg animate-modal-sheet"
          style={{
            backgroundColor: "#ece5d8",
            border: "1px solid rgba(0,0,0,0.1)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.42) inset, 0 2px 4px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.13), 0 20px 50px rgba(0,0,0,0.08)",
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)' opacity='0.045'/%3E%3C/svg%3E")`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-lg"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)" }}
            aria-hidden
          />
          <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-black/10 px-6 py-4">
            <div className="min-w-0 pr-2">
              <h2 className="text-lg font-bold" style={{ color: "#000000" }}>
                {loading ? "Orçamento" : budget ? `Orçamento ${budgetChronologicalNumber(budgets, budget.id)}` : "Orçamento"}
              </h2>
              {!loading && budget ? (
                <p className="mt-0.5 text-sm font-medium" style={{ color: "#000000" }}>
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
                <p className="mt-1 text-sm font-medium" style={{ color: "#000000" }}>
                  <span className="font-semibold">Km</span> {mileageKm}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:opacity-80"
              style={{ color: "#000000" }}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10" style={{ color: "#000000" }}>
                <RefreshCw className="h-8 w-8 animate-spin opacity-70" />
                <p className="text-sm font-medium">Carregando orçamento…</p>
              </div>
            ) : error ? (
              <div className="p-6 text-sm font-medium text-red-800">{error}</div>
            ) : !budget ? (
              <div className="p-6 text-sm font-medium" style={{ color: "#000000" }}>
                Orçamento não encontrado.
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]">
                {!isModuleMode && detail ? (
                  <DiagnosticAuthorizationRecordPanel
                    variant="paper"
                    signedAt={detail.diagnostic_authorization_signed_at ?? null}
                    signaturePath={detail.diagnostic_authorization_signature_path ?? null}
                  />
                ) : null}
                {budget.diagnosis ? (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "#000000" }}>
                      Diagnóstico
                    </h3>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "#000000" }}>
                      {budget.diagnosis}
                    </div>
                  </section>
                ) : null}
                {budget.services.length > 0 ? (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "#000000" }}>
                      Serviços
                    </h3>
                    <ul className="list-none space-y-2 text-sm">
                      {budget.services.map((s, i) => (
                        <li
                          key={i}
                          className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${budgetReadRowClass(
                            s.approved,
                            "paper",
                            approvalContrast
                          )}`}
                          style={{ color: "#000000" }}
                        >
                          {s.approved === true ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-label="Aprovado" />
                          ) : null}
                          {s.approved === false ? <X className="h-4 w-4 shrink-0 text-red-700" aria-label="Reprovado" /> : null}
                          {s.approved !== true && s.approved !== false ? (
                            <span className="h-4 w-4 shrink-0 font-bold" style={{ color: "#000000" }} aria-label="Pendente">
                              —
                            </span>
                          ) : null}
                          <span
                            className={approvalContrast && s.approved === true ? "font-medium" : ""}
                            style={{ color: "#000000" }}
                          >
                            {s.description}
                          </span>
                          {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                            <span className="text-[13px] font-semibold tabular-nums opacity-90" style={{ color: "#000000" }}>
                              ({formatLaborLabel(Number(s.labor_hours))})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {budget.parts.length > 0 ? (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "#000000" }}>
                      Peças
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {budget.parts.map((p, i) => (
                        <li
                          key={i}
                          className={`flex items-center gap-2 ${budgetReadRowClass(p.approved, "paper", approvalContrast)}`}
                          style={{ color: "#000000" }}
                        >
                          {p.approved === true ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-label="Aprovado" />
                          ) : null}
                          {p.approved === false ? <X className="h-4 w-4 shrink-0 text-red-700" aria-label="Reprovado" /> : null}
                          {p.approved !== true && p.approved !== false ? (
                            <span className="h-4 w-4 shrink-0 font-bold" style={{ color: "#000000" }} aria-label="Pendente">
                              —
                            </span>
                          ) : null}
                          <span style={{ color: "#000000" }}>
                            <span
                              className={
                                approvalContrast && p.approved === true ? "font-semibold" : "font-medium"
                              }
                            >
                              ({p.quantity}x)
                            </span>{" "}
                            {p.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {budget.observations ? (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "#000000" }}>
                      Observações
                    </h3>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "#000000" }}>
                      {budget.observations}
                    </div>
                  </section>
                ) : null}
              </div>
            )}

            {!loading && !error && budget ? (
              <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-black/10 px-6 py-4">
                <button
                  type="button"
                  onClick={() => printBudgetWithDetail(budget, detail, { isModuleMode, mileageKm })}
                  className="inline-flex items-center gap-2 rounded-lg border border-black/20 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-black/5"
                  style={{ color: "#000000" }}
                >
                  <Printer className="h-4 w-4" /> Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => printBudgetMechanicWithDetail(budget, detail, { isModuleMode, mileageKm })}
                  className="inline-flex items-center gap-2 rounded-lg border border-black/20 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-black/5"
                  style={{ color: "#000000" }}
                >
                  <Printer className="h-4 w-4" /> Via mecânico
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "#3d3932" }}
                >
                  Fechar
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
