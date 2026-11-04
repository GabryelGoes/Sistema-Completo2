import type { RdaToolDefinition } from "../types.js";

/**
 * Tools reais de leitura (e propostas de ação).
 * Execução sempre com workshop_id do servidor — nunca do cliente.
 *
 * Setores:
 * - Pátio = service_orders.order_type = 'vehicle'
 * - Laboratório = service_orders.order_type = 'module'
 * Não confundir módulos do Laboratório com peças/módulos ABS do estoque.
 */
export const RDA_PRODUCTION_TOOLS: RdaToolDefinition[] = [
  {
    id: "rda_list_stalled_vehicles",
    description:
      "Lista OS do PÁTIO (somente order_type=vehicle / veículos) paradas há mais tempo. Não inclui módulos do Laboratório. Para o Laboratório use rda_list_stalled_modules. Para a oficina inteira, chame as duas tools e apresente os setores separadamente.",
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
    id: "rda_list_stalled_modules",
    description:
      "Lista OS do LABORATÓRIO (somente order_type=module / módulos recebidos para reparo) paradas há mais tempo. Não inclui veículos do Pátio e não lista peças do estoque. Para o Pátio use rda_list_stalled_vehicles.",
    parameters: {
      type: "object",
      properties: {
        minHours: { type: "number", description: "Mínimo de horas parado (default 24)" },
        limit: { type: "number", description: "Máximo de resultados (default 15)" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_laboratorio",
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
      "Histórico de OS do PÁTIO (order_type=vehicle) por placa ou serviceOrderId. Não mistura OS de módulo do Laboratório.",
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
      "Busca OS anteriores com queixa/diagnóstico semelhante (texto). Use sector=patio|laboratorio para filtrar; all/omitido retorna ambos com order_type/sector em cada item.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        plate: { type: "string" },
        vehicleModel: { type: "string" },
        sector: {
          type: "string",
          description: "patio | laboratorio | all (default all, itens rotulados)",
        },
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
      "Busca PEÇAS/CADASTROS no ESTOQUE (workshop_parts) por texto. Não lista OS do Laboratório nem módulos recebidos para conserto. Nunca confundir item de estoque com OS de módulo do Lab.",
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
      "Snapshot das etapas do PÁTIO (somente order_type=vehicle): contagem por status, aguardando aprovação/peças. Não inclui Laboratório. Para Lab use rda_lab_stage_snapshot; para oficina inteira, chame as duas e apresente separadamente.",
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
    id: "rda_lab_stage_snapshot",
    description:
      "Snapshot das etapas do LABORATÓRIO (somente order_type=module): contagem por status, filas típicas do Lab. Não inclui veículos do Pátio nem itens de estoque.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_laboratorio",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_get_service_order",
    description:
      "Detalhes de uma OS específica por id ou placa — encontra tanto veículo (Pátio) quanto módulo (Laboratório). Sempre informe order_type/sector no resultado.",
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
      "Propõe abrir/navegar para uma OS na interface (não altera dados; exige confirmação humana). Aceita veículo ou módulo.",
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
  // ----- Radar Fase 3: consultas gerenciais (somente gestão / access_radar_qualidade) -----
  {
    id: "rda_quality_person_profile",
    description:
      "Perfil profissional do funcionário no Radar: identidade, nível de carreira e matriz de competências (score null = não avaliado, nunca zero).",
    parameters: {
      type: "object",
      properties: {
        personName: { type: "string" },
        systemUserId: { type: "string" },
        workshopTechnicianId: { type: "string" },
        from: { type: "string", description: "Início do período (ISO ou YYYY-MM-DD)" },
        to: { type: "string", description: "Fim do período" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_radar_qualidade",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_quality_recognitions",
    description: "Registros positivos / reconhecimentos do funcionário no Radar.",
    parameters: {
      type: "object",
      properties: {
        personName: { type: "string" },
        systemUserId: { type: "string" },
        workshopTechnicianId: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
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
    id: "rda_quality_incidents",
    description:
      "Ocorrências e possíveis retrabalhos do funcionário (workshop_technician_incidents). Fatos do sistema; não inventar culpa.",
    parameters: {
      type: "object",
      properties: {
        personName: { type: "string" },
        systemUserId: { type: "string" },
        workshopTechnicianId: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
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
    id: "rda_quality_service_history",
    description:
      "Histórico de serviços apontados ao mecânico, SEPARADO em Pátio (vehicle) e Laboratório (module). Nunca misturar setores.",
    parameters: {
      type: "object",
      properties: {
        personName: { type: "string" },
        systemUserId: { type: "string" },
        workshopTechnicianId: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
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
    id: "rda_quality_work_times",
    description:
      "Tempos produtivos e pausas do mecânico (rda_work_sessions), com quebra Pátio/Lab quando order_type existir.",
    parameters: {
      type: "object",
      properties: {
        personName: { type: "string" },
        systemUserId: { type: "string" },
        workshopTechnicianId: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_radar_qualidade",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_quality_career_and_pdi",
    description:
      "Metas, PDI, treinamentos necessários e reuniões/feedbacks anteriores do funcionário.",
    parameters: {
      type: "object",
      properties: {
        personName: { type: "string" },
        systemUserId: { type: "string" },
        workshopTechnicianId: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_radar_qualidade",
    side: "read",
    requiresHumanConfirmation: false,
  },
  {
    id: "rda_quality_managerial_evaluations",
    description: "Avaliações gerenciais RDA (solicitações/status) do mecânico no período.",
    parameters: {
      type: "object",
      properties: {
        personName: { type: "string" },
        systemUserId: { type: "string" },
        workshopTechnicianId: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
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
    id: "rda_quality_prior_weekly_reviews",
    description:
      "Memória estruturada: revisões semanais anteriores e rascunhos/aprovados do Radar (não só o chat).",
    parameters: {
      type: "object",
      properties: {
        personName: { type: "string" },
        systemUserId: { type: "string" },
        workshopTechnicianId: { type: "string" },
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
    id: "rda_quality_week_dossier",
    description:
      "Pacote consolidado da semana para entrevista gerencial: perfil, serviços (Pátio/Lab), tempos, reconhecimentos, ocorrências, PDI, reuniões, avaliações e lacunas. Use no início da Revisão Semanal.",
    parameters: {
      type: "object",
      properties: {
        personName: { type: "string" },
        systemUserId: { type: "string" },
        workshopTechnicianId: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
    requiredPermission: "access_radar_qualidade",
    side: "read",
    requiresHumanConfirmation: false,
  },
];
