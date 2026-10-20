import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  Package,
  RefreshCw,
  Scissors,
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
import { getWorkshopAbsModulesAnalytics } from '../services/apiService';
import { formatBRL, formatCompactBRL } from '../utils/workshopPartsAnalytics';
import type { AbsModulesAnalyticsResponse } from '../utils/workshopAbsModulesAnalytics';
import { absModuleKindLabel, formatAbsModuleMoney } from '../utils/workshopAbsModules';

type PeriodPreset = '7d' | '30d' | '90d' | 'month' | 'year';

const PERIOD_OPTIONS: { id: PeriodPreset; label: string }[] = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'month', label: 'Mês' },
  { id: 'year', label: 'Ano' },
];

const shell =
  'rounded-[22px] border-0 bg-white/80 dark:bg-zinc-900/55 backdrop-blur-xl shadow-none';

const CHART_GRID = 'stroke-zinc-200/80 dark:stroke-white/10';
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: 'none',
  background: 'rgba(255,255,255,0.96)',
  fontSize: 13,
};

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#8b5cf6'];

function ChartHelpButton({
  text,
  popoverSide = 'left',
}: {
  text: string;
  popoverSide?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Como funciona este gráfico"
        className="flex h-5 w-5 items-center justify-center rounded-full border-0 bg-blue-500 text-[11px] font-bold leading-none text-white shadow-none transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
      >
        ?
      </button>
      {open ? (
        <div
          role="tooltip"
          className={`absolute top-0 z-50 w-[min(calc(100vw-2rem),268px)] rounded-xl border-0 bg-white px-3 py-2.5 text-[12px] leading-snug text-zinc-700 shadow-none dark:bg-zinc-900 dark:text-zinc-200 ${
            popoverSide === 'right' ? 'left-full ml-2' : 'right-full mr-2'
          }`}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
  helpText,
  helpPopoverSide,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
  helpText?: string;
  helpPopoverSide?: 'left' | 'right';
}) {
  return (
    <div className={`${shell} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {label}
            </p>
            {helpText ? (
              <ChartHelpButton text={helpText} popoverSide={helpPopoverSide ?? 'left'} />
            ) : null}
          </div>
          <p className="mt-1 text-[22px] font-bold tabular-nums text-zinc-900 dark:text-white sm:text-2xl">
            {value}
          </p>
          {sub ? <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">{sub}</p> : null}
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-none`}
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
  helpText,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  helpText?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${shell} overflow-visible p-4 sm:p-5 ${className}`}>
      <div className="relative mb-4">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-[15px] font-bold text-zinc-900 dark:text-white">
            {title}
          </h3>
          {helpText ? <ChartHelpButton text={helpText} /> : null}
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export type WorkshopAbsModulesAnalyticsViewProps = {
  onBack: () => void;
};

export function WorkshopAbsModulesAnalyticsView({ onBack }: WorkshopAbsModulesAnalyticsViewProps) {
  const [preset, setPreset] = useState<PeriodPreset>('30d');
  const [data, setData] = useState<AbsModulesAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getWorkshopAbsModulesAnalytics(preset);
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Erro ao carregar gráficos ABS.');
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusPie = useMemo(() => {
    if (!data) return [];
    const { disponivel, fora_estoque, desmembrado, reservado } = data.statusHealth;
    return [
      { name: 'Disponível', value: disponivel, color: '#10b981' },
      { name: 'Fora', value: fora_estoque, color: '#ef4444' },
      { name: 'Desmembrado', value: desmembrado, color: '#f59e0b' },
      { name: 'Reservado', value: reservado, color: '#6366f1' },
    ].filter((d) => d.value > 0);
  }, [data]);

  const kindChart = useMemo(() => {
    if (!data) return [];
    return data.byKind.map((k) => ({
      name: k.label,
      total: k.total,
      available: k.available,
      value: k.valueAtPrice,
    }));
  }, [data]);

  const mfrChart = useMemo(() => {
    if (!data) return [];
    return data.byManufacturer.slice(0, 8).map((m) => ({
      name: m.manufacturer.length > 16 ? `${m.manufacturer.slice(0, 14)}…` : m.manufacturer,
      fullName: m.manufacturer,
      value: m.valueAtPrice,
      available: m.available,
      total: m.total,
    }));
  }, [data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-emerald-50/40 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950">
      <div className="shrink-0 border-b border-zinc-200/60 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/[0.06] dark:bg-zinc-950/80 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border-0 bg-zinc-100 px-3 py-2 text-[14px] font-semibold text-zinc-800 hover:bg-zinc-200/80 shadow-none dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-none">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-zinc-900 dark:text-white">
                Painel dos módulos ABS
              </h2>
              <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                {data?.period.label ?? 'Carregando…'} · estoque e movimentações
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white shadow-none hover:bg-emerald-500 disabled:opacity-50"
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
                  ? 'bg-emerald-600 text-white shadow-none'
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
          <div className="rounded-xl border-0 bg-red-50 px-4 py-3 text-[14px] text-red-800 shadow-none dark:bg-red-950/40 dark:text-red-200">
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
                label="Disponíveis"
                value={String(data.summary.unitsAvailable)}
                sub={`${data.summary.unitsTotal} unidades · ${data.summary.modelsCount} modelos`}
                icon={<Package className="h-5 w-5" />}
                accent="from-emerald-500 to-teal-600"
                helpText="Unidades com status disponível agora. Modelos = cadastros técnicos distintos."
                helpPopoverSide="right"
              />
              <KpiCard
                label="Saídas (período)"
                value={String(data.summary.exitsQty)}
                sub={`Receita ${formatCompactBRL(data.summary.exitsRevenue)}`}
                icon={<TrendingUp className="h-5 w-5" />}
                accent="from-rose-500 to-orange-600"
                helpText="Quantidade de saídas no período e soma do preço de venda das unidades que saíram."
              />
              <KpiCard
                label="Valor em estoque"
                value={formatCompactBRL(data.summary.stockValueAtPrice)}
                sub={`Custo ${formatCompactBRL(data.summary.stockValueAtCost)}`}
                icon={<Wallet className="h-5 w-5" />}
                accent="from-violet-500 to-indigo-600"
                helpText="Soma dos preços das unidades disponíveis (e reservadas no custo). Situação atual, sem filtro de período."
              />
              <KpiCard
                label="Desmembrados"
                value={String(data.summary.unitsDisassembled)}
                sub={`${data.summary.unitsOut} fora de estoque · ${data.summary.entriesQty} entradas`}
                icon={<Scissors className="h-5 w-5" />}
                accent="from-cyan-500 to-blue-600"
                helpText="Unidades marcadas como desmembradas. Entradas e fora de estoque usam o período só nas entradas."
              />
            </div>

            <ChartCard
              title="Saídas x entradas"
              subtitle="Movimentações por dia no período"
              className="col-span-full"
              helpText="Verde = receita estimada das saídas (preço da unidade). Azul tracejado no eixo de quantidade via saídas/entradas no tooltip."
            >
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="absRevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
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
                      formatter={(value: number, name: string) => {
                        if (name === 'revenue') return [formatBRL(value), 'Receita saídas'];
                        if (name === 'exits') return [value, 'Saídas'];
                        return [value, 'Entradas'];
                      }}
                    />
                    <Legend
                      formatter={(v) =>
                        v === 'revenue' ? 'Receita' : v === 'exits' ? 'Saídas' : 'Entradas'
                      }
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#absRevGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="exits"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      fill="transparent"
                    />
                    <Area
                      type="monotone"
                      dataKey="entries"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <div className="grid gap-5 lg:grid-cols-2">
              <ChartCard
                title="Estoque por tipo"
                subtitle="Unidades totais e valor disponível"
                helpText="Quantidade total por tipo de módulo e valor de venda das unidades disponíveis."
              >
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kindChart} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className={CHART_GRID} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={36} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number, name: string) => [
                          name === 'value' ? formatBRL(v) : v,
                          name === 'value' ? 'Valor disp.' : name === 'available' ? 'Disponíveis' : 'Total',
                        ]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="total" name="Total" fill="#14b8a6" radius={[6, 6, 0, 0]} maxBarSize={28} />
                      <Bar
                        dataKey="available"
                        name="Disponíveis"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard
                title="Saúde do estoque"
                subtitle="Situação atual das unidades"
                helpText="Distribuição por status: disponível, fora de estoque, desmembrado e reservado."
              >
                <div className="h-[280px]">
                  {statusPie.length === 0 ? (
                    <p className="py-12 text-center text-[14px] text-zinc-500">
                      Nenhum módulo cadastrado.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusPie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={78}
                          paddingAngle={3}
                        >
                          {statusPie.map((entry) => (
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
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <ChartCard
                title="Fabricantes (valor em estoque)"
                subtitle="Top marcas por preço × unidades disponíveis"
                helpText="Quanto vale o estoque disponível de cada fabricante (preço de venda)."
              >
                <div className="h-[300px]">
                  {mfrChart.length === 0 ? (
                    <p className="py-12 text-center text-[14px] text-zinc-500">Sem dados.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={mfrChart}
                        layout="vertical"
                        margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className={CHART_GRID} horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => formatCompactBRL(Number(v))}
                        />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelFormatter={(_, p) =>
                            (p?.[0]?.payload as { fullName?: string })?.fullName ?? ''
                          }
                          formatter={(v: number) => [formatBRL(v), 'Valor']}
                        />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
                          {mfrChart.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </ChartCard>

              <div className={`${shell} p-4 sm:p-5`}>
                <div className="mb-3 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600" />
                  <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">
                    Saídas recentes
                  </h3>
                  <ChartHelpButton
                    text="Últimas saídas do período, com fabricante, código e preço da unidade."
                    popoverSide="right"
                  />
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                    {data.recentExits.length}
                  </span>
                </div>
                {data.recentExits.length === 0 ? (
                  <p className="py-8 text-center text-[14px] text-zinc-500">
                    Nenhuma saída neste período.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
                    {data.recentExits.map((row) => (
                      <li
                        key={`${row.publicId}-${row.exitedAt}`}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]"
                      >
                        <span className="min-w-0 font-medium text-zinc-900 dark:text-white">
                          <span className="mr-2 font-mono text-[12px] font-bold text-emerald-700 dark:text-emerald-400">
                            {row.publicId}
                          </span>
                          {row.manufacturer || '—'}
                          {row.code ? (
                            <span className="ml-2 text-[12px] font-normal text-zinc-500">
                              {row.code}
                            </span>
                          ) : null}
                          <span className="ml-2 text-[11px] font-normal text-zinc-400">
                            {absModuleKindLabel(row.kind)}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                          {formatAbsModuleMoney(row.unitPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
