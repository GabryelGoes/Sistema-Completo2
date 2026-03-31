/** Chaves salvas em workshop_settings (gerência) e zaya_alert_subscribers.alert_types */
export const ZAYA_ALERT_OPTIONS = [
  {
    id: "zaya_stage_aguardando_aprovacao",
    label: "Etapa: aguardando aprovação",
    description: "Quando um veículo entra na etapa Aguardando aprovação.",
  },
  {
    id: "zaya_stage_finalizado",
    label: "Etapa: finalizado",
    description: "Quando um veículo entra na etapa Finalizado.",
  },
  {
    id: "zaya_orcamento_com_aprovacao",
    label: "Orçamento: com itens aprovados",
    description: "Quando a gerência marca pelo menos um item do orçamento como aprovado.",
  },
  {
    id: "zaya_orcamento_com_reprovacao",
    label: "Orçamento: com itens reprovados",
    description: "Quando a gerência marca pelo menos um item do orçamento como reprovado.",
  },
] as const;

export type ZayaAlertTypeId = (typeof ZAYA_ALERT_OPTIONS)[number]["id"];

export const ZAYA_ALERT_IDS: ZayaAlertTypeId[] = ZAYA_ALERT_OPTIONS.map((o) => o.id);

export function isZayaAlertType(id: string): id is ZayaAlertTypeId {
  return (ZAYA_ALERT_IDS as string[]).includes(id);
}
