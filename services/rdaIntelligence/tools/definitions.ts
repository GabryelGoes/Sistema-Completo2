import type { RdaToolDefinition } from "../types.js";

/**
 * Tools reais de leitura (e propostas de ação).
 * Execução sempre com workshop_id do servidor — nunca do cliente.
 */
export const RDA_PRODUCTION_TOOLS: RdaToolDefinition[] = [
  {
    id: "rda_list_stalled_vehicles",
    description:
      "Lista veículos/OS do pátio parados há mais tempo (por status e idade em horas).",
    parameters: {
      type: "object",
      properties: {
        minHours: { type: "number", description: "Mínimo de horas parado (default 24)" },
        limit: { type: "number", description: "Máximo de resultados (default 15)" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_patio",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_technician_active_work",
    description:
      "Lista sessões de cronômetro ativas e OS atribuídas a um mecânico (nome ou userId).",
    parameters: {
      type: "object",
      properties: {
        technicianName: { type: "string" },
        technicianUserId: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_radar_qualidade",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_vehicle_maintenance_history",
    description:
      "Histórico de OS/manutenção do veículo por placa (ou serviceOrderId).",
    parameters: {
      type: "object",
      properties: {
        plate: { type: "string" },
        serviceOrderId: { type: "string" },
        limit: { type: "number" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_patio",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_search_similar_complaints",
    description:
      "Busca OS anteriores com queixa/diagnóstico semelhante (texto).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        plate: { type: "string" },
        vehicleModel: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    requiredPermission: "access_patio",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_search_error_bulletins",
    description: "Consulta boletins técnicos / boletim de erros por texto ou DTC.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        dtcCode: { type: "string" },
        limit: { type: "number" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_boletim_erros",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_search_stock_parts",
    description:
      "Busca peças no estoque da oficina por texto (não afirma compatibilidade ABS sem evidência).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        onlyInStock: { type: "boolean" },
        limit: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    requiredPermission: "access_estoque_pecas",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_work_performance_summary",
    description:
      "Resumo de produtividade dos mecânicos (tempo produtivo/pausas) no período.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO datetime" },
        to: { type: "string", description: "ISO datetime" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_radar_qualidade",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_pending_evaluations",
    description: "Lista solicitações de avaliação gerencial pendentes/adiadas.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string" },
        limit: { type: "number" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_radar_qualidade",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_patio_stage_snapshot",
    description:
      "Snapshot das etapas do pátio: contagem por status, aguardando aprovação/peças.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_patio",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_get_service_order",
    description: "Detalhes de uma OS por id ou placa.",
    parameters: {
      type: "object",
      properties: {
        serviceOrderId: { type: "string" },
        plate: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_patio",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_propose_open_service_order",
    description:
      "Propõe abrir/navegar para uma OS na interface (não altera dados; exige confirmação humana).",
    parameters: {
      type: "object",
      properties: {
        serviceOrderId: { type: "string" },
        plate: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_patio",
    side: "write",
    requiresHumanConfirmation: true,
  },
];
