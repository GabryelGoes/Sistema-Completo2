import { patioStageLabel } from "./stages.js";
import { thresholdHoursForStatus, type PatioThresholds } from "./thresholds.js";
import type {
  PatioAttentionItem,
  PatioBottleneck,
  PatioBottleneckKind,
  PatioDashboard,
  PatioDeliveryRisk,
  PatioOrderFact,
  PatioPriorityItem,
} from "./types.js";

function hoursSinceIso(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (nowMs - t) / 3_600_000);
}

function hoursUntilIso(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (t - nowMs) / 3_600_000;
}

export function enrichOrderFact(
  row: {
    id: string;
    os_number?: number | null;
    plate?: string | null;
    vehicle_model?: string | null;
    vehicle_brand?: string | null;
    status?: string | null;
    assigned_technician?: string | null;
    issue_description?: string | null;
    delivery_date?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  },
  nowMs = Date.now()
): PatioOrderFact {
  const status = String(row.status || "").trim();
  const updatedAt = String(row.updated_at || row.created_at || new Date(nowMs).toISOString());
  return {
    id: row.id,
    osNumber: row.os_number ?? null,
    plate: row.plate ?? null,
    vehicleModel: row.vehicle_model ?? null,
    vehicleBrand: row.vehicle_brand ?? null,
    status,
    statusLabel: patioStageLabel(status),
    assignedTechnician: row.assigned_technician ?? null,
    issueDescription: row.issue_description ?? null,
    deliveryDate: row.delivery_date ?? null,
    createdAt: String(row.created_at || updatedAt),
    updatedAt,
    hoursInStage: Math.round(hoursSinceIso(updatedAt, nowMs) * 10) / 10,
    hoursToDelivery: (() => {
      const h = hoursUntilIso(row.delivery_date, nowMs);
      return h == null ? null : Math.round(h * 10) / 10;
    })(),
    orderType: "vehicle",
  };
}

type HistHint = { serviceKey?: string; medianMs?: number | null; sampleCount?: number; confidence?: string };

function buildBottleneck(
  kind: PatioBottleneckKind,
  title: string,
  status: string,
  orders: PatioOrderFact[],
  thresholdHours: number,
  evidence: string
): PatioBottleneck | null {
  if (!orders.length) return null;
  return {
    kind,
    title,
    status,
    count: orders.length,
    thresholdHours,
    evidence,
    orderIds: orders.map((o) => o.id),
    sample: orders.slice(0, 8).map((o) => ({
      id: o.id,
      plate: o.plate,
      osNumber: o.osNumber,
      hoursInStage: o.hoursInStage,
      technician: o.assignedTechnician,
    })),
  };
}

export function detectPatioBottlenecks(
  orders: PatioOrderFact[],
  thresholds: PatioThresholds,
  histHints?: HistHint[]
): PatioBottleneck[] {
  const over = (status: string) => {
    const th = thresholdHoursForStatus(thresholds, status);
    return {
      th,
      list: orders.filter((o) => o.status === status && o.hoursInStage >= th),
    };
  };

  const out: PatioBottleneck[] = [];
  const push = (b: PatioBottleneck | null) => {
    if (b) out.push(b);
  };

  {
    const { th, list } = over("AGUARDANDO_AVALIACAO");
    push(
      buildBottleneck(
        "waiting_evaluation",
        "Aguardando avaliação além do limite",
        "AGUARDANDO_AVALIACAO",
        list,
        th,
        `${list.length} veículo(s) ≥ ${th}h na etapa (updated_at).`
      )
    );
  }
  {
    const { th, list } = over("AVALIACAO_TECNICA");
    push(
      buildBottleneck(
        "slow_diagnostic",
        "Diagnósticos demorados",
        "AVALIACAO_TECNICA",
        list,
        th,
        `${list.length} OS em Avaliação técnica ≥ ${th}h.`
      )
    );
  }
  {
    const { th, list } = over("AGUARDANDO_APROVACAO");
    push(
      buildBottleneck(
        "waiting_approval",
        "Orçamentos aguardando aprovação",
        "AGUARDANDO_APROVACAO",
        list,
        th,
        `${list.length} OS aguardando aprovação ≥ ${th}h.`
      )
    );
  }
  {
    const { th, list } = over("ORCAMENTO_APROVADO");
    push(
      buildBottleneck(
        "approved_not_started",
        "Aprovados ainda não iniciados",
        "ORCAMENTO_APROVADO",
        list,
        th,
        `${list.length} OS com orçamento aprovado ≥ ${th}h sem avançar.`
      )
    );
  }
  {
    const { th, list } = over("AGUARDANDO_PECAS");
    push(
      buildBottleneck(
        "waiting_parts",
        "Aguardando peças",
        "AGUARDANDO_PECAS",
        list,
        th,
        `${list.length} veículo(s) aguardando peças ≥ ${th}h.`
      )
    );
  }
  {
    const { th, list } = over("PECAS_DISPONIVEIS");
    push(
      buildBottleneck(
        "parts_ready_not_started",
        "Peças disponíveis sem início",
        "PECAS_DISPONIVEIS",
        list,
        th,
        `${list.length} OS com peças disponíveis ≥ ${th}h.`
      )
    );
  }
  {
    const { th, list } = over("EM_SERVICO");
    push(
      buildBottleneck(
        "slow_execution",
        "Em serviço acima do limite",
        "EM_SERVICO",
        list,
        th,
        `${list.length} OS em serviço ≥ ${th}h (não confundir com tempo apontado da Fase 2).`
      )
    );
  }
  {
    const { th, list } = over("FASE_DE_TESTE");
    push(
      buildBottleneck(
        "waiting_test_or_finish",
        "Aguardando teste / finalização",
        "FASE_DE_TESTE",
        list,
        th,
        `${list.length} OS em fase de teste ≥ ${th}h.`
      )
    );
  }

  // Histórico Fase 2: só se confiança suficiente
  const reliable = (histHints || []).filter(
    (h) =>
      (h.sampleCount || 0) >= 15 &&
      (h.confidence === "medium" || h.confidence === "high") &&
      h.medianMs != null &&
      h.medianMs > 0
  );
  if (reliable.length) {
    const med = Math.max(...reliable.map((h) => h.medianMs!));
    const medHours = med / 3_600_000;
    const slow = orders.filter(
      (o) => o.status === "EM_SERVICO" && o.hoursInStage > medHours * 1.5
    );
    if (slow.length) {
      push(
        buildBottleneck(
          "above_historical",
          "Duração acima do histórico esperado",
          "EM_SERVICO",
          slow,
          Math.round(medHours * 1.5),
          `Comparado à mediana histórica (~${Math.round(medHours)}h, n≥15). Evidência Fase 2; não é julgamento individual.`
        )
      );
    }
  }

  return out.sort((a, b) => b.count - a.count || b.thresholdHours - a.thresholdHours);
}

export function suggestPatioPriorities(
  orders: PatioOrderFact[],
  thresholds: PatioThresholds,
  limit = 20
): PatioPriorityItem[] {
  const items: PatioPriorityItem[] = [];
  for (const o of orders) {
    if (o.status === "FINALIZADO" || o.status === "CANCELLED") continue;
    const reasons: string[] = [];
    let score = 0;
    const th = thresholdHoursForStatus(thresholds, o.status);

    if (o.hoursInStage >= th) {
      score += 30 + Math.min(40, o.hoursInStage - th);
      reasons.push(`Permanência na etapa (${o.hoursInStage}h ≥ limite ${th}h)`);
    } else if (o.hoursInStage >= th * 0.7) {
      score += 12;
      reasons.push(`Próximo do limite de etapa (${o.hoursInStage}h / ${th}h)`);
    }

    if (o.hoursToDelivery != null) {
      if (o.hoursToDelivery < 0) {
        score += 50;
        reasons.push(`Entrega prometida atrasada (${Math.abs(o.hoursToDelivery)}h)`);
      } else if (o.hoursToDelivery <= 24) {
        score += 35;
        reasons.push(`Entrega em ≤24h (${o.hoursToDelivery}h)`);
      } else if (o.hoursToDelivery <= 72) {
        score += 15;
        reasons.push(`Entrega em ≤72h`);
      }
    }

    if (o.status === "AGUARDANDO_PECAS") {
      score += 10;
      reasons.push("Aguardando peças (impedimento de execução)");
    }
    if (o.status === "PECAS_DISPONIVEIS" || o.status === "ORCAMENTO_APROVADO") {
      score += 18;
      reasons.push("Pronto para iniciar serviço (aprovado / peças)");
    }
    if (o.status === "AGUARDANDO_AVALIACAO" && o.hoursInStage >= 8) {
      score += 8;
      reasons.push("Fila de avaliação");
    }
    if (!o.assignedTechnician) {
      score += 5;
      reasons.push("Sem técnico responsável atribuído");
    } else {
      reasons.push(`Técnico: ${o.assignedTechnician}`);
    }

    if (reasons.length < 2 && score < 15) continue;
    items.push({
      orderId: o.id,
      plate: o.plate,
      osNumber: o.osNumber,
      status: o.status,
      statusLabel: o.statusLabel,
      score: Math.round(score),
      reasons,
      hoursInStage: o.hoursInStage,
      hoursToDelivery: o.hoursToDelivery,
      technician: o.assignedTechnician,
    });
  }
  return items.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function detectDeliveryRisks(
  orders: PatioOrderFact[],
  limit = 20
): PatioDeliveryRisk[] {
  const out: PatioDeliveryRisk[] = [];
  for (const o of orders) {
    if (o.hoursToDelivery == null || !o.deliveryDate) continue;
    if (o.status === "FINALIZADO" || o.status === "CANCELLED") continue;
    const reasons: string[] = [];
    let risk: PatioDeliveryRisk["risk"] | null = null;
    if (o.hoursToDelivery < 0) {
      risk = "overdue";
      reasons.push(`Atrasado ${Math.abs(o.hoursToDelivery)}h em relação a ${o.deliveryDate}`);
    } else if (o.hoursToDelivery <= 24) {
      risk = "imminent";
      reasons.push(`Entrega em ${o.hoursToDelivery}h — status atual: ${o.statusLabel}`);
    } else if (o.hoursToDelivery <= 72 && o.hoursInStage >= 24) {
      risk = "watch";
      reasons.push(`Entrega em ${o.hoursToDelivery}h e ${o.hoursInStage}h na etapa ${o.statusLabel}`);
    }
    if (!risk) continue;
    if (o.status === "AGUARDANDO_PECAS") reasons.push("Ainda aguarda peças");
    if (o.status === "AGUARDANDO_APROVACAO") reasons.push("Ainda aguarda aprovação do orçamento");
    out.push({
      orderId: o.id,
      plate: o.plate,
      osNumber: o.osNumber,
      status: o.status,
      statusLabel: o.statusLabel,
      deliveryDate: o.deliveryDate,
      hoursToDelivery: o.hoursToDelivery,
      risk,
      reasons,
    });
  }
  const rank = { overdue: 0, imminent: 1, watch: 2 };
  return out.sort((a, b) => rank[a.risk] - rank[b.risk] || a.hoursToDelivery - b.hoursToDelivery).slice(0, limit);
}

export function buildAttentionList(
  bottlenecks: PatioBottleneck[],
  priorities: PatioPriorityItem[],
  risks: PatioDeliveryRisk[],
  limit = 25
): PatioAttentionItem[] {
  const byId = new Map<string, PatioAttentionItem>();
  for (const r of risks) {
    byId.set(r.orderId, {
      orderId: r.orderId,
      plate: r.plate,
      osNumber: r.osNumber,
      status: r.status,
      statusLabel: r.statusLabel,
      kind: `risk_${r.risk}`,
      summary: r.reasons[0] || "Risco de entrega",
      hoursInStage: 0,
    });
  }
  for (const p of priorities.slice(0, 15)) {
    if (byId.has(p.orderId)) continue;
    byId.set(p.orderId, {
      orderId: p.orderId,
      plate: p.plate,
      osNumber: p.osNumber,
      status: p.status,
      statusLabel: p.statusLabel,
      kind: "priority",
      summary: p.reasons[0] || "Prioridade sugerida",
      hoursInStage: p.hoursInStage,
    });
  }
  for (const b of bottlenecks) {
    for (const s of b.sample.slice(0, 3)) {
      if (byId.has(s.id)) continue;
      byId.set(s.id, {
        orderId: s.id,
        plate: s.plate,
        osNumber: s.osNumber,
        status: b.status,
        statusLabel: patioStageLabel(b.status),
        kind: b.kind,
        summary: b.title,
        hoursInStage: s.hoursInStage,
      });
    }
  }
  return [...byId.values()].slice(0, limit);
}

export function buildPatioDashboard(input: {
  orders: PatioOrderFact[];
  thresholds: PatioThresholds;
  histHints?: HistHint[];
  knowledgeHints?: PatioDashboard["knowledgeHints"];
}): PatioDashboard {
  const orders = input.orders;
  const byStatus: Record<string, number> = {};
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  }
  const bottlenecks = detectPatioBottlenecks(orders, input.thresholds, input.histHints);
  const priorities = suggestPatioPriorities(orders, input.thresholds);
  const risks = detectDeliveryRisks(orders);
  const attention = buildAttentionList(bottlenecks, priorities, risks);

  const proposedKnowledgeDrafts: PatioDashboard["proposedKnowledgeDrafts"] = [];
  for (const b of bottlenecks.slice(0, 2)) {
    if (b.count < 5) continue;
    proposedKnowledgeDrafts.push({
      title: `Orientação de pátio — ${b.title}`,
      content: [
        `Padrão observado (não oficial): ${b.evidence}`,
        `Etapa: ${b.status}; limiar configurável: ${b.thresholdHours}h.`,
        `Hipótese: revisar fila, peças ou comunicação com cliente.`,
        `Não salvar OS individuais como memória — apenas orientação de processo após aprovação.`,
      ].join("\n"),
      knowledgeKeyHint: `patio.bottleneck.${b.kind}`.slice(0, 100),
      category: "operational_learning",
    });
  }

  return {
    summary: {
      totalActive: orders.length,
      byStatus,
      bottleneckCount: bottlenecks.length,
      priorityCount: priorities.length,
      riskCount: risks.length,
      attentionCount: attention.length,
      note: "Somente OS do Pátio (order_type=vehicle). Permanência ≈ updated_at. RDA não altera etapas.",
    },
    attention,
    bottlenecks,
    priorities,
    risks,
    thresholds: { ...input.thresholds },
    knowledgeHints: input.knowledgeHints || [],
    proposedKnowledgeDrafts,
    disclaimer:
      "Sugestões com evidências dos dados. Sem movimentação automática. Limites de etapa são configuráveis pela gestão.",
  };
}

export function filterOrdersByStatus(orders: PatioOrderFact[], status: string): PatioOrderFact[] {
  return orders.filter((o) => o.status === status);
}

export function ordersReadyToStart(orders: PatioOrderFact[]): PatioOrderFact[] {
  return orders.filter(
    (o) => o.status === "ORCAMENTO_APROVADO" || o.status === "PECAS_DISPONIVEIS"
  );
}
