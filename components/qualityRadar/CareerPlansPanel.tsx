import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import {
  createQualityPdiGoal,
  createQualityPdiPlan,
  getQualityCareerCatalog,
  getQualityDecisionInsights,
  getQualityPdiPlans,
  getQualityPersonCareerSummary,
  patchQualityPdiGoal,
  putQualityCompetencyAssessment,
  putQualityPersonCareerLevel,
} from '../../services/apiService';
import type { QualityRadarTechnicianOption } from '../../utils/qualityRadarTechnicians';
import { hub } from './hubTheme';
import { HubEmptyState, HubPreparedNote, HubSectionHeader, HubStatCard } from './HubPrimitives';

type CatalogCompetency = {
  id: string;
  code: string;
  name: string;
  kind: 'technical' | 'professional';
  rubrics: Array<{ level: number; label: string; description: string }>;
};

type CatalogLevel = {
  id: string;
  code: string;
  name: string;
  description: string;
};

export function CareerPlansPanel({
  employees,
}: {
  employees: QualityRadarTechnicianOption[];
}) {
  const [selectedId, setSelectedId] = useState<string>(employees[0]?.id ?? '');
  const [catalog, setCatalog] = useState<{
    competencies: CatalogCompetency[];
    careerLevels: CatalogLevel[];
  } | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [plans, setPlans] = useState<Array<Record<string, unknown>>>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [disclaimer, setDisclaimer] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [pdiSituation, setPdiSituation] = useState('');

  const selected = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? employees[0] ?? null,
    [employees, selectedId]
  );

  const loadCatalog = useCallback(async () => {
    const cat = await getQualityCareerCatalog();
    if (cat.code === 'QUALITY_RADAR_PHASE2_MIGRATION_REQUIRED') {
      setMigrationPending(true);
      setCatalog({ competencies: [], careerLevels: [] });
      return;
    }
    setMigrationPending(false);
    setCatalog({
      competencies: cat.competencies as CatalogCompetency[],
      careerLevels: cat.careerLevels as CatalogLevel[],
    });
  }, []);

  const loadPerson = useCallback(async () => {
    if (!selected) {
      setSummary(null);
      setPlans([]);
      setInsights([]);
      return;
    }
    setError(null);
    try {
      const [sum, pdi, dec] = await Promise.all([
        getQualityPersonCareerSummary({
          systemUserId: selected.systemUserId,
          technicianId: selected.workshopTechnicianId,
          personName: selected.name,
        }),
        getQualityPdiPlans({
          systemUserId: selected.systemUserId || undefined,
          technicianId: selected.workshopTechnicianId || undefined,
        }),
        getQualityDecisionInsights({
          systemUserId: selected.systemUserId || undefined,
          technicianId: selected.workshopTechnicianId || undefined,
        }),
      ]);
      setSummary(sum);
      setPlans(pdi.plans || []);
      setInsights(dec.signals || []);
      setDisclaimer(dec.disclaimer || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar carreira.');
    }
  }, [selected]);

  useEffect(() => {
    setLoading(true);
    void loadCatalog()
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha no catálogo.'))
      .finally(() => setLoading(false));
  }, [loadCatalog]);

  useEffect(() => {
    void loadPerson();
  }, [loadPerson]);

  const assessments = (summary?.assessments as Array<{ competencyId: string; score: number | null }>) || [];
  const scoreByComp = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const a of assessments) m.set(String(a.competencyId), a.score);
    return m;
  }, [assessments]);

  const activePlan = plans.find((p) => p.status === 'active' || p.status === 'draft') || plans[0];

  if (migrationPending) {
    return (
      <div className={hub.stack}>
        <HubSectionHeader
          title="Planos de Carreira"
          subtitle="Competências, níveis, PDI e evolução."
        />
        <HubPreparedNote>
          Migration Fase 2 pendente (`20261104190000_quality_radar_phase2_career.sql`). Aplique em
          homologação com autorização antes de usar esta área.
        </HubPreparedNote>
      </div>
    );
  }

  return (
    <div className={hub.stack}>
      <HubSectionHeader
        title="Planos de Carreira"
        subtitle="Matriz de competências, níveis configuráveis e PDI — promoção é decisão humana."
      />

      <div className="flex flex-wrap gap-2">
        <select
          className={hub.select}
          value={selected?.id || ''}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {employees.length === 0 ? (
            <option value="">Nenhum funcionário</option>
          ) : (
            employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.jobTitle ? ` · ${e.jobTitle}` : ''}
              </option>
            ))
          )}
        </select>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {!selected ? (
        <HubEmptyState
          icon={Target}
          title="Selecione um funcionário"
          description="O desenvolvimento é individual — sem ranking entre níveis diferentes."
        />
      ) : loading && !catalog ? (
        <p className={hub.muted}>Carregando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <HubStatCard
              label="Dominadas (≥4)"
              value={((summary?.mastered as unknown[]) || []).length}
            />
            <HubStatCard
              label="Em desenvolvimento"
              value={((summary?.developing as unknown[]) || []).length}
            />
            <HubStatCard
              label="Sem avaliação"
              value={((summary?.unrated as unknown[]) || []).length}
              hint="Não é zero"
            />
            <HubStatCard
              label="Nível atual"
              value={
                catalog?.careerLevels.find(
                  (l) =>
                    l.id ===
                    ((summary?.career as { careerLevelId?: string } | null)?.careerLevelId || '')
                )?.name || '—'
              }
            />
          </div>

          <div className={`${hub.surface} ${hub.cardPad}`}>
            <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
              Nível de carreira (manual)
            </p>
            <p className={`mt-1 text-[12px] ${hub.muted}`}>
              Atribuição pela gerência. O sistema não promove automaticamente.
            </p>
            <select
              className={`${hub.select} mt-3 w-full max-w-md`}
              value={
                ((summary?.career as { careerLevelId?: string } | null)?.careerLevelId as string) ||
                ''
              }
              disabled={busy}
              onChange={(e) => {
                const careerLevelId = e.target.value || null;
                setBusy(true);
                void putQualityPersonCareerLevel({
                  personName: selected.name,
                  systemUserId: selected.systemUserId,
                  workshopTechnicianId: selected.workshopTechnicianId,
                  careerLevelId,
                })
                  .then(() => loadPerson())
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : 'Falha ao salvar nível.')
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <option value="">Sem nível definido</option>
              {(catalog?.careerLevels || []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className={`${hub.surface} ${hub.cardPad}`}>
            <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
              Matriz de competências
            </p>
            <p className={`mt-1 text-[12px] ${hub.muted}`}>
              Escala 1–5 com rubrica. Deixe “—” para não avaliado (nunca conta como zero).
            </p>
            <div className={`mt-3 ${hub.stack}`}>
              {(['technical', 'professional'] as const).map((kind) => (
                <div key={kind}>
                  <p className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${hub.muted}`}>
                    {kind === 'technical' ? 'Técnicas' : 'Profissionais'}
                  </p>
                  <div className="space-y-2">
                    {(catalog?.competencies || [])
                      .filter((c) => c.kind === kind)
                      .map((c) => {
                        const score = scoreByComp.has(c.id) ? scoreByComp.get(c.id) : null;
                        return (
                          <div
                            key={c.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                                {c.name}
                              </p>
                              {score != null && c.rubrics[score - 1] ? (
                                <p className={`text-[11px] ${hub.muted}`}>
                                  {c.rubrics[score - 1].label}: {c.rubrics[score - 1].description}
                                </p>
                              ) : (
                                <p className={`text-[11px] ${hub.muted}`}>Sem avaliação</p>
                              )}
                            </div>
                            <select
                              className={hub.select}
                              value={score == null ? '' : String(score)}
                              disabled={busy}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === '' ? null : Number(raw);
                                setBusy(true);
                                void putQualityCompetencyAssessment({
                                  competencyId: c.id,
                                  personName: selected.name,
                                  systemUserId: selected.systemUserId,
                                  workshopTechnicianId: selected.workshopTechnicianId,
                                  score: next,
                                })
                                  .then(() => loadPerson())
                                  .catch((err) =>
                                    setError(
                                      err instanceof Error ? err.message : 'Falha ao salvar nota.'
                                    )
                                  )
                                  .finally(() => setBusy(false));
                              }}
                            >
                              <option value="">—</option>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${hub.surface} ${hub.cardPad}`}>
            <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
              Prontidão por nível (informativa)
            </p>
            <p className={`mt-1 text-[12px] ${hub.muted}`}>
              Requisitos sem nota não contam como atendidos. Não dispara promoção.
            </p>
            <ul className="mt-3 space-y-2">
              {((summary?.levelReadiness as Array<Record<string, unknown>>) || []).map((lvl) => {
                const readiness = lvl.readiness as {
                  met: number;
                  total: number;
                  ready: boolean;
                };
                return (
                  <li
                    key={String(lvl.id)}
                    className="flex items-center justify-between rounded-xl bg-[#FAFAFA] px-3 py-2 text-[13px] dark:bg-zinc-950"
                  >
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {String(lvl.name)}
                    </span>
                    <span className={hub.muted}>
                      {readiness.met}/{readiness.total}
                      {readiness.ready ? ' · critérios ok' : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={`${hub.surface} ${hub.cardPad}`}>
            <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
              Plano de desenvolvimento (PDI)
            </p>
            {!activePlan ? (
              <div className="mt-3 space-y-2">
                <textarea
                  className={hub.input}
                  rows={3}
                  value={pdiSituation}
                  onChange={(e) => setPdiSituation(e.target.value)}
                  placeholder="Situação atual…"
                />
                <button
                  type="button"
                  className={hub.btnPrimary}
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void createQualityPdiPlan({
                      personName: selected.name,
                      systemUserId: selected.systemUserId,
                      workshopTechnicianId: selected.workshopTechnicianId,
                      currentSituation: pdiSituation,
                      strengthsSummary: ((summary?.mastered as Array<{ name: string }>) || [])
                        .map((m) => m.name)
                        .join(', '),
                      developmentSummary: (
                        (summary?.developing as Array<{ name: string }>) || []
                      )
                        .map((m) => m.name)
                        .join(', '),
                    })
                      .then(() => {
                        setPdiSituation('');
                        return loadPerson();
                      })
                      .catch((err) =>
                        setError(err instanceof Error ? err.message : 'Falha ao criar PDI.')
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  Criar PDI
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className={`text-[13px] ${hub.muted}`}>
                  Situação: {String(activePlan.currentSituation || '—')}
                </p>
                <p className={`text-[12px] ${hub.muted}`}>
                  Responsável: {String(activePlan.ownerName || '—')} · Status:{' '}
                  {String(activePlan.status)}
                </p>
                <ul className="space-y-2">
                  {((activePlan.goals as Array<Record<string, unknown>>) || []).map((g) => (
                    <li
                      key={String(g.id)}
                      className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                          {String(g.title)}
                        </p>
                        <select
                          className={hub.select}
                          value={String(g.status)}
                          disabled={busy}
                          onChange={(e) => {
                            setBusy(true);
                            void patchQualityPdiGoal(String(g.id), { status: e.target.value })
                              .then(() => loadPerson())
                              .catch((err) =>
                                setError(
                                  err instanceof Error ? err.message : 'Falha ao atualizar meta.'
                                )
                              )
                              .finally(() => setBusy(false));
                          }}
                        >
                          {['open', 'in_progress', 'done', 'blocked', 'cancelled'].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      {g.trainingNeeded ? (
                        <p className={`mt-1 text-[12px] ${hub.muted}`}>
                          Treinamento: {String(g.trainingNeeded)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <input
                    className={`${hub.input} max-w-sm`}
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="Nova meta…"
                  />
                  <button
                    type="button"
                    className={hub.btnSecondary}
                    disabled={busy || !goalTitle.trim()}
                    onClick={() => {
                      setBusy(true);
                      void createQualityPdiGoal(String(activePlan.id), {
                        title: goalTitle.trim(),
                      })
                        .then(() => {
                          setGoalTitle('');
                          return loadPerson();
                        })
                        .catch((err) =>
                          setError(err instanceof Error ? err.message : 'Falha ao criar meta.')
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    Adicionar meta
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={`${hub.surface} ${hub.cardPad}`}>
            <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
              Apoio a decisões gerenciais
            </p>
            <p className={`mt-1 text-[12px] ${hub.muted}`}>{disclaimer}</p>
            {insights.length === 0 ? (
              <p className={`mt-3 text-[13px] ${hub.muted}`}>
                Sem sinais adicionais no momento — continue registrando avaliações e reuniões.
              </p>
            ) : (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-zinc-700 dark:text-zinc-300">
                {insights.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
