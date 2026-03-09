import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  User,
  ArrowRight,
  Copy,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { PatioCarIcon } from "../ui/PatioCarIcon";
import { Customer } from "../../types";
import {
  getServiceOrders,
  getServiceOrderById,
  updateServiceOrderStatus,
  ServiceOrderListItem,
  type ServiceOrderUpdateActor,
} from "../../services/apiService";

interface PatioViewSupabaseProps {
  onUseCustomerData?: (data: Customer) => void;
  actorOptions?: ServiceOrderUpdateActor;
}

const STATUS_COLUMNS: {
  status: "RECEPTION" | "YARD" | "FINISHED";
  label: string;
  nextStatus?: "RECEPTION" | "YARD" | "FINISHED" | "CANCELLED";
  nextLabel?: string;
}[] = [
  { status: "RECEPTION", label: "Recepção", nextStatus: "YARD", nextLabel: "→ Pátio" },
  { status: "YARD", label: "Pátio", nextStatus: "FINISHED", nextLabel: "→ Finalizado" },
  { status: "FINISHED", label: "Finalizado", nextLabel: undefined },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const PatioViewSupabase: React.FC<PatioViewSupabaseProps> = ({
  onUseCustomerData,
  actorOptions,
}) => {
  const [orders, setOrders] = useState<ServiceOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [useReceptionId, setUseReceptionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await getServiceOrders();
      setOrders(data);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar ordens.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleMove = async (
    id: string,
    newStatus: "RECEPTION" | "YARD" | "FINISHED" | "CANCELLED"
  ) => {
    setMovingId(id);
    try {
      await updateServiceOrderStatus(id, newStatus, actorOptions);
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
      );
    } catch (e: any) {
      alert(e?.message ?? "Erro ao movimentar.");
    } finally {
      setMovingId(null);
    }
  };

  const handleUseInReception = async (id: string) => {
    if (!onUseCustomerData) return;
    setUseReceptionId(id);
    try {
      const detail = await getServiceOrderById(id);
      const c = detail.customers;
      const customer: Customer = {
        name: c?.name ?? "",
        cpf: c?.cpf ?? "",
        phone: c?.phone ?? "",
        email: c?.email ?? undefined,
        cep: c?.cep ?? "",
        address: c?.address ?? "",
        addressNumber: c?.address_number ?? "",
        vehicleModel: detail.vehicle_model,
        plate: (detail.plate || '').toUpperCase(),
        issueDescription: detail.issue_description ?? "",
      };
      onUseCustomerData(customer);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao carregar dados.");
    } finally {
      setUseReceptionId(null);
    }
  };

  const byStatus = (status: "RECEPTION" | "YARD" | "FINISHED") =>
    orders.filter((o) => o.status === status);

  return (
    <div className="w-full max-w-6xl mx-auto pb-24 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-yellow flex items-center gap-3">
            <PatioCarIcon className="w-8 h-8" />
            PÁTIO
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            Ordens de serviço por etapa
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-brand-yellow hover:border-brand-yellow/30 transition-all disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {loading && orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <RefreshCw className="w-10 h-10 animate-spin text-brand-yellow mb-4" />
          <p>Carregando ordens...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STATUS_COLUMNS.map(({ status, label, nextStatus, nextLabel }) => (
            <div
              key={status}
              className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 min-h-[320px] flex flex-col"
            >
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-4 flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    status === "RECEPTION"
                      ? "bg-amber-500"
                      : status === "YARD"
                      ? "bg-brand-yellow"
                      : "bg-green-500"
                  }`}
                />
                {label}
              </h2>
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[70vh] custom-scrollbar">
                {byStatus(status).map((order) => (
                  <div
                    key={order.id}
                    className="bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 hover:border-brand-yellow/30 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="font-black text-zinc-900 dark:text-white uppercase tracking-tight text-sm truncate">
                        {order.vehicle_model || "Veículo"}
                      </span>
                      <span className="shrink-0 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-mono text-xs font-bold px-2 py-0.5 rounded">
                        {(order.plate || "—").toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300 text-sm mb-3">
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {order.customers?.name || "Cliente"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs mb-3">
                      <Calendar className="w-3 h-3 shrink-0" />
                      {formatDate(order.created_at)}
                    </div>
                    {order.issue_description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-3 border-l-2 border-brand-yellow/50 pl-2">
                        {order.issue_description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {nextStatus && nextLabel && (
                        <button
                          onClick={() => handleMove(order.id, nextStatus)}
                          disabled={movingId === order.id}
                          className="px-3 py-1.5 rounded-lg bg-brand-yellow text-black text-xs font-bold hover:bg-[#fcd61e] transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {movingId === order.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <ArrowRight className="w-3 h-3" />
                          )}
                          {nextLabel}
                        </button>
                      )}
                      {onUseCustomerData && (
                        <button
                          onClick={() => handleUseInReception(order.id)}
                          disabled={useReceptionId === order.id}
                          className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors disabled:opacity-50 flex items-center gap-1"
                          title="Usar dados na Recepção"
                        >
                          {useReceptionId === order.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          Usar na Recepção
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {byStatus(status).length === 0 && (
                  <div className="text-center py-8 text-zinc-400 dark:text-zinc-500 text-sm">
                    Nenhuma ordem
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
