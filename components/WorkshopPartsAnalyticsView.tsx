import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Loader2,
  Package,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getWorkshopPartsAnalytics,
  type WorkshopPartsAnalyticsResponse,
} from '../services/apiService';
import { formatBRL, formatCompactBRL } from '../utils/workshopPartsAnalytics';

type PeriodPreset = '7d' | '30d' | '90d' | 'month' | 'year';

const PERIOD_OPTIONS: { id: PeriodPreset; label: string }[] = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'month', label: 'Mês' },
  { id: 'year', label: 'Ano' },
];

const shell =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-zinc-900/55 backdrop-blur-xl ' +
  'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.45)]';

const CHART_GRID = 'stroke-zinc-200/80 dark:stroke-white/10';
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgba(0,0,0,0.08)',
  background: 'rgba(255,255,255,0.96)',
  fontSize: 13,
};

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#8b5cf6'];

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className={`${shell} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
          <p className="mt-1 text-[22px] font-bold tabular-nums text-zinc-900 dark:text-white sm:text-2xl">{value}</p>
          {sub ? <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">{sub}</p> : null}
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${shell} p-4 sm:p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

export type WorkshopPartsAnalyticsViewProps = {
  onBack: () => void;
};

export const WorkshopPartsAnalyticsView: React.FC<WorkshopPartsAnalyticsViewProps> = ({ onBack }) => {
  const [preset, setPreset] = useState<PeriodPreset>('30d');
  const [data, setData] = useState<WorkshopPartsAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getWorkshopPartsAnalytics(preset);
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Erro ao carregar gráficos.');
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    void load();
  }, [load]);

  const healthPie = useMemo(() => {
    if (!data) return [];
    const { ok, low, zero } = data.stockHealth;
    return [
      { name: 'Normal', value: ok, color: '#10b981' },
      { name: 'Acabando', value: low, color: '#f59e0b' },
      { name: 'Sem estoque', value: zero, color: '#ef4444' },
    ].filter((d) => d.value > 0);
  }, [data]);

  const categoryChart = useMemo(() => {
    if (!data) return [];
    return data.stockByCategory.slice(0, 8).map((c) => ({
      name: c.categoryName.length > 18 ? `${c.categoryName.slice(0, 16)}…` : c.categoryName,
      fullName: c.categoryName,
      value: c.valueAtPrice,
      count: c.productCount,
    }));
  }, [data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-emerald-50/40 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950">
      <div className="shrink-0 border-b border-zinc-200/60 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/[0.06] dark:bg-zinc-950/80 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 px-3 py-2 text-[14px] font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-md">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-zinc-900 dark:text-white">Painel do estoque</h2>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                {data?.period.label ?? 'Carregando…'} · peças aprovadas em orçamentos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPreset(opt.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                preset === opt.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-zinc-200/90 text-zinc-700 hover:bg-zinc-300/90 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto px-4 py-4 sm:px-6 sm:py-5 custom-scrollbar">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {loading && !data ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
          </div>
        ) : null}

        {data ? (
          <div className="space-y-5 pb-8">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Faturamento (peças)"
                value={formatCompactBRL(data.summary.revenueTotal)}
                sub={`${data.summary.partsSoldQty.toLocaleString('pt-BR')} un. aprovadas`}
                icon={<TrendingUp className="h-5 w-5" />}
                accent="from-emerald-500 to-teal-600"
              />
              <KpiCard
                label="Despesas"
                value={formatCompactBRL(data.summary.expensesTotal)}
                sub={`CMV ${formatCompactBRL(data.summary.cogsTotal)} + compras ${formatCompactBRL(data.summary.purchasesExpenseTotal)}`}
                icon={<TrendingDown className="h-5 w-5" />}
                accent="from-rose-500 to-orange-600"
              />
              <KpiCard
                label="Margem"
                value={formatCompactBRL(data.summary.marginTotal)}
                sub={`${data.summary.marginPct.toFixed(1)}% sobre faturamento`}
                icon={<Wallet className="h-5 w-5" />}
                accent="from-violet-500 to-indigo-600"
              />
              <KpiCard
                label="Valor em estoque"
                value={formatCompactBRL(data.summary.stockValueAtPrice)}
                sub={`${data.summary.productsCount} produtos · custo ${formatCompactBRL(data.summary.stockValueAtCost)}`}
                icon={<Package className="h-5 w-5" />}
                accent="from-cyan-500 to-blue-600"
              />
            </div>

            <ChartCard
              title="Faturamento x despesas"
              subtitle="Por dia no período — faturamento de peças aprovadas em orçamentos"
              className="col-span-full"
            >
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className={CHART_GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#a1a1aa" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="#a1a1aa"
                      tickFormatter={(v) => formatCompactBRL(Number(v))}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number, name: string) => [formatBRL(value), name === 'revenue' ? 'Faturamento' : 'Despesas']}
                    />
                    <Legend
                      formatter={(v) => (v === 'revenue' ? 'Faturamento' : 'Despesas')}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#revGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="expenses"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      fill="url(#expGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <div className="grid gap-5 lg:grid-cols-2">
              <ChartCard title="Mais vendidos (valor)" subtitle="Peças aprovadas no período — preço do catálogo">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.topByValue}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className={CHART_GRID} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => formatCompactBRL(Number(v))}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => (String(v).length > 14 ? `${String(v).slice(0, 12)}…` : v)}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number) => [formatBRL(v), 'Faturamento']}
                        labelFormatter={(_, payload) => {
                          const row = payload?.[0]?.payload as { name?: string; catalogNumber?: number | null };
                          const num = row?.catalogNumber != null ? `#${row.catalogNumber} · ` : '';
                          return `${num}${row?.name ?? ''}`;
                        }}
                      />
                      <Bar dataKey="revenue" fill="#10b981" radius={[0, 6, 6, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Mais vendidos (unidades)" subtitle="Quantidade aprovada no período">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.topByUnits}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className={CHART_GRID} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => (String(v).length > 14 ? `${String(v).slice(0, 12)}…` : v)}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="qty" fill="#14b8a6" radius={[0, 6, 6, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <ChartCard title="Estoque por categoria" subtitle="Valor de venda (preço × qtd)">
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryChart} margin={{ top: 4, right: 4, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" className={CHART_GRID} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-32} textAnchor="end" height={56} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactBRL(Number(v))} width={48} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ''}
                        formatter={(v: number) => [formatBRL(v), 'Valor']}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={36}>
                        {categoryChart.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Saúde do estoque" subtitle="Situação atual dos produtos">
                <div className="h-[240px]">
                  {healthPie.length === 0 ? (
                    <p className="py-12 text-center text-[14px] text-zinc-500">Sem produtos cadastrados.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={healthPie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={78}
                          paddingAngle={3}
                        >
                          {healthPie.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </ChartCard>

              <ChartCard title="Compras planejadas" subtitle="Custos registrados no período">
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.purchasesPipeline.filter((p) => p.status !== 'cancelled')} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className={CHART_GRID} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactBRL(Number(v))} width={48} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatBRL(v), 'Custo']} />
                      <Bar dataKey="totalCost" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            {data.lowStock.length > 0 ? (
              <div className={`${shell} p-4 sm:p-5`}>
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">Reposição urgente</h3>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                    {data.lowStock.length}
                  </span>
                </div>
                <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
                  {data.lowStock.map((row) => (
                    <li key={row.partId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                      <span className="min-w-0 font-medium text-zinc-900 dark:text-white">
                        {row.catalogNumber != null ? (
                          <span className="mr-2 font-bold text-emerald-700 dark:text-emerald-400">#{row.catalogNumber}</span>
                        ) : null}
                        {row.name}
                        {row.originalCode ? (
                          <span className="ml-2 text-[12px] font-normal text-zinc-500">{row.originalCode}</span>
                        ) : null}
                      </span>
                      <span className="tabular-nums text-amber-800 dark:text-amber-300 font-semibold">
                        {row.stockQty.toFixed(3)} / mín. {row.minStockQty.toFixed(3)} {row.unitOfMeasure}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 px-4">
              Faturamento e ranking usam peças <strong>aprovadas</strong> em orçamentos no período, com preço e custo do
              catálogo atual. Despesas incluem CMV dessas peças e compras registradas no período.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};
