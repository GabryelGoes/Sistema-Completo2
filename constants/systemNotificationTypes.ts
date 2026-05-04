export const SYSTEM_NOTIFICATION_TYPE_OPTIONS = [
  {
    id: "comment",
    label: "Comentários",
    description: "Nova mensagem nos comentários da OS.",
  },
  {
    id: "budget_created",
    label: "Orçamento criado",
    description: "Um novo orçamento foi criado no card.",
  },
  {
    id: "budget_edited",
    label: "Orçamento editado",
    description: "Um orçamento existente foi alterado.",
  },
  {
    id: "stage_change",
    label: "Mudança de etapa",
    description: "A OS foi movida para outra etapa.",
  },
  {
    id: "complaint_edited",
    label: "Queixa editada",
    description: "A queixa/descrição da OS foi alterada.",
  },
  {
    id: "delivery_date_changed",
    label: "Data de entrega alterada",
    description: "A previsão de entrega da OS mudou.",
  },
] as const;

export type SystemNotificationTypeId = (typeof SYSTEM_NOTIFICATION_TYPE_OPTIONS)[number]["id"];
export const SYSTEM_NOTIFICATION_IDS = SYSTEM_NOTIFICATION_TYPE_OPTIONS.map((x) => x.id);
