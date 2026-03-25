/**
 * Definições compartilhadas das ferramentas da assistente (chat completions + Realtime API).
 */

/** Primeiro token do nome exibido (ex.: "João Silva" → "João"; "maria" → "maria"). */
export function firstNameFromDisplayName(displayName: string | undefined | null): string | null {
  const t = (displayName ?? "").trim();
  if (!t) return null;
  const first = t.split(/\s+/)[0];
  return first || null;
}

export interface AssistantUserContextOptions {
  /** Sessão de administrador: a assistente não deve tratar o usuário pelo nome. */
  isAdminSession?: boolean;
  /** Nome de exibição ou login do usuário (técnico). */
  userDisplayName?: string;
}

export function buildAssistantSystemInstructions(
  assistantName: string,
  allowedTabs: string[],
  stageCatalog: string,
  userContext?: AssistantUserContextOptions
): string {
  const isAdmin = userContext?.isAdminSession === true;
  const rawName = userContext?.userDisplayName?.trim();
  const firstName = !isAdmin && rawName ? firstNameFromDisplayName(rawName) : null;

  const nameBlock = isAdmin
    ? `\nQuem está falando é um administrador: não trate essa pessoa pelo nome e não use o nome dela em cumprimentos (tom cordial e neutro).`
    : firstName
      ? `\nQuem está falando é o técnico "${rawName}". Chame essa pessoa pelo primeiro nome "${firstName}" quando for natural (cumprimentos ou tom próximo), sem repetir o nome em toda frase.`
      : `\nQuem está falando é um usuário técnico do sistema. Não invente um nome; use tom cordial e neutro.`;

  return `Você é ${assistantName}, a assistente virtual do app Rei do ABS (gestão de oficina). Apresente-se pelo nome quando fizer sentido. Responda em português do Brasil, de forma breve e útil.${nameBlock}
O usuário só pode acessar estas abas: ${allowedTabs.join(", ")}.
Use navigate_to_tab para mudar de tela; open_settings para tema/efeitos.
Explique passo a passo quando pedirem "como fazer" algo no app (cadastro, orçamento, etc.), combinando com as ferramentas quando fizer sentido.

Etapas do fluxo (IDs exatos):
${stageCatalog}

Ferramentas principais: create_workshop_reminder (SEMPRE que o usuário pedir para criar/gravar um lembrete: salva no modal "Lembretes do Pátio" com target patio ou "Lembretes do Laboratório" com target laboratorio; se não disser qual, pergunte ou infira pelo contexto); open_patio_vehicle_modal (abrir modal do veículo no Pátio pelo nome do carro — também encontra OS arquivadas/entregues se não houver em aberto; se ambíguo, pedir cliente e repetir com customer_name_query); open_patio_vehicle_budget_view (abrir o Pátio e exibir o modal de leitura do orçamento do veículo; se vários orçamentos na mesma OS, a ferramenta retorna lista — pergunte qual o usuário quer e chame de novo com budget_index: 1 = mais recente, ou budget_id); append_complaint_to_vehicle (acrescentar texto à queixa do cliente pelo modelo do carro; mesma desambiguação; não use em OS arquivada); list_vehicles_in_stage (por etapa; use status CANCELLED para listar arquivados/entregues); update_service_order_status (mudar etapa; id/os_number/placa); search_service_orders (busca texto em OS abertas e arquivadas); list_orders_by_technician (only_mine ou técnico); list_upcoming_deliveries; count_orders_by_stage; count_customer_open_orders; add_service_order_comment; get_service_order_comments; get_service_order_budgets; create_service_order_budget_simple; list_appointments; create_appointment (data AAAA-MM-DD); register_customer_vehicle_intake (cadastro rápido Recepção); search_customers.
Quando o usuário pedir para ver, abrir ou mostrar um orçamento de um carro no Pátio, use open_patio_vehicle_budget_view (não só open_patio_vehicle_modal).
Não invente dados: use só retorno das ferramentas. Datas em ISO AAAA-MM-DD.`;
}

/** Instruções extras para voz na Realtime API (tom mais humano). */
export const ASSISTANT_REALTIME_VOICE_ADDENDUM = `
No modo voz: seja calorosa e natural, como alguém da oficina falando com o cliente; evite tom de robô, listas excessivas e frases muito longas; use entonação conversacional.`;

export function buildAssistantChatTools(allowedTabs: string[], statusEnum: string[]) {
  const reminderTargets: ("patio" | "laboratorio")[] = [];
  if (allowedTabs.includes("patio")) reminderTargets.push("patio");
  if (allowedTabs.includes("laboratorio")) reminderTargets.push("laboratorio");

  return [
    {
      type: "function" as const,
      function: {
        name: "navigate_to_tab",
        description:
          "Muda a tela principal do aplicativo. Use quando o usuário pedir para ir à Recepção, Agenda, Pátio, Laboratório ou Início.",
        parameters: {
          type: "object",
          properties: {
            tab: {
              type: "string",
              enum: allowedTabs,
              description:
                "home=Início, reception=Recepção, agenda=Agenda, patio=Pátio, laboratorio=Laboratório.",
            },
          },
          required: ["tab"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "open_settings",
        description: "Abre o painel de configurações (tema, efeitos, modo cinematográfico).",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_vehicles_in_stage",
        description:
          "Lista ordens de serviço na etapa informada (Pátio: veículos; Laboratório: módulos). Para veículos arquivados/entregues use status CANCELLED. Use quando perguntarem quais carros ou OS estão em uma fase.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: statusEnum,
              description: "ID da etapa (ex.: AVALIACAO_TECNICA, EM_SERVICO).",
            },
            order_type: {
              type: "string",
              enum: ["vehicle", "module"],
              description: "vehicle = Pátio (padrão). module = Laboratório para OS de módulo.",
            },
          },
          required: ["status"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_service_order_status",
        description:
          "Altera a etapa (status) de uma ordem de serviço. Exija um identificador: UUID da OS, ou número da OS (os_number), ou placa (veículos).",
        parameters: {
          type: "object",
          properties: {
            new_status: {
              type: "string",
              enum: statusEnum,
              description: "ID da etapa de destino.",
            },
            service_order_id: {
              type: "string",
              description: "UUID da ordem de serviço (opcional se usar os_number ou plate).",
            },
            os_number: {
              type: "integer",
              description: "Número da OS exibido no app (opcional).",
            },
            plate: {
              type: "string",
              description: "Placa do veículo, para localizar a OS (opcional, veículos).",
            },
          },
          required: ["new_status"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "add_service_order_comment",
        description: "Adiciona comentário no chat da OS (modal Pátio/Laboratório).",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Texto do comentário." },
            service_order_id: { type: "string" },
            os_number: { type: "integer" },
            plate: { type: "string" },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_service_order_comments",
        description: "Lista comentários de uma OS.",
        parameters: {
          type: "object",
          properties: {
            service_order_id: { type: "string" },
            os_number: { type: "integer" },
            plate: { type: "string" },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_orders_by_technician",
        description:
          "Lista OS abertas atribuídas a um técnico. Use only_mine=true para o técnico logado, ou technician_user_id (UUID), ou technician_name_search.",
        parameters: {
          type: "object",
          properties: {
            only_mine: { type: "boolean" },
            technician_user_id: { type: "string" },
            technician_name_search: { type: "string", description: "Parte do nome ou username." },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_upcoming_deliveries",
        description: "Entregas previstas nos próximos dias e lista de atrasadas.",
        parameters: {
          type: "object",
          properties: {
            days_ahead: { type: "integer", description: "Padrão 14, máx. 90." },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_service_orders",
        description:
          "Busca OS por placa, modelo, cliente, número, trecho da queixa. Inclui ordens arquivadas (entregues); cada resultado traz arquivada=true/false.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_service_order_budgets",
        description: "Lista orçamentos salvos de uma OS.",
        parameters: {
          type: "object",
          properties: {
            service_order_id: { type: "string" },
            os_number: { type: "integer" },
            plate: { type: "string" },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_service_order_budget_simple",
        description: "Cria um orçamento com diagnóstico, um serviço e opcionalmente peças.",
        parameters: {
          type: "object",
          properties: {
            diagnosis: { type: "string" },
            service_description: { type: "string" },
            service_order_id: { type: "string" },
            os_number: { type: "integer" },
            plate: { type: "string" },
            card_name: { type: "string" },
            observations: { type: "string" },
            parts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  quantity: { type: "string" },
                },
              },
            },
          },
          required: ["diagnosis", "service_description"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_appointments",
        description: "Lista agendamentos da oficina.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_appointment",
        description: "Cria agendamento na agenda.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            customer_name: { type: "string" },
            phone: { type: "string" },
            vehicle_model: { type: "string" },
            plate: { type: "string" },
            date: { type: "string", description: "AAAA-MM-DD" },
            time: { type: "string", description: "HH:MM" },
            notes: { type: "string" },
          },
          required: ["customer_name", "vehicle_model", "plate", "date", "time"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "count_orders_by_stage",
        description: "Conta quantas OS abertas existem em cada etapa.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "count_customer_open_orders",
        description: "Conta e lista OS abertas cujo cliente contém o nome informado.",
        parameters: {
          type: "object",
          properties: {
            customer_name_fragment: { type: "string" },
          },
          required: ["customer_name_fragment"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "register_customer_vehicle_intake",
        description: "Cadastro rápido na Recepção: cliente + veículo + queixa (cria OS).",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            phone: { type: "string" },
            vehicle_model: { type: "string" },
            plate: { type: "string" },
            issue_description: { type: "string" },
          },
          required: ["name", "phone", "vehicle_model", "plate"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_customers",
        description: "Busca clientes por nome ou telefone.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "open_patio_vehicle_modal",
        description:
          "Abre o modal do veículo na página Pátio. Use vehicle_model_query com nome/modelo (ex.: Civic, Gol). Se a ferramenta retornar ambiguous com várias opções, pergunte qual o nome do cliente e chame de novo com customer_name_query.",
        parameters: {
          type: "object",
          properties: {
            vehicle_model_query: {
              type: "string",
              description: "Nome ou modelo do veículo a abrir.",
            },
            customer_name_query: {
              type: "string",
              description: "Parte do nome do cliente, se houver mais de um veículo igual.",
            },
          },
          required: ["vehicle_model_query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "open_patio_vehicle_budget_view",
        description:
          "Abre o Pátio no modal do veículo e exibe o overlay de leitura do orçamento. Use vehicle_model_query (ex.: Civic, Gol). Se houver mais de um veículo igual, peça o cliente e repita com customer_name_query. Se houver mais de um orçamento na OS, a resposta traz orcamentos com indice (1 = mais recente); chame de novo com budget_index ou budget_id.",
        parameters: {
          type: "object",
          properties: {
            vehicle_model_query: {
              type: "string",
              description: "Nome ou modelo do veículo.",
            },
            customer_name_query: {
              type: "string",
              description: "Se houver vários veículos iguais, parte do nome do cliente.",
            },
            budget_id: {
              type: "string",
              description: "UUID do orçamento, se já souber (ex.: após lista na resposta).",
            },
            budget_index: {
              type: "integer",
              description: "Posição na lista retornada quando há vários orçamentos (1 = mais recente).",
            },
          },
          required: ["vehicle_model_query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "append_complaint_to_vehicle",
        description:
          "Acrescenta texto ao campo queixa do cliente (issue_description) da OS do veículo indicado. Use vehicle_model_query (ex.: Argo, Civic) e complaint_text com o que o usuário pediu para adicionar. Se ambiguous, peça o cliente e repita com customer_name_query.",
        parameters: {
          type: "object",
          properties: {
            complaint_text: {
              type: "string",
              description: "Trecho a acrescentar à queixa (ex.: pedal do freio está baixando).",
            },
            vehicle_model_query: {
              type: "string",
              description: "Nome ou modelo do carro para localizar a OS.",
            },
            customer_name_query: {
              type: "string",
              description: "Se houver vários carros iguais, parte do nome do cliente.",
            },
          },
          required: ["complaint_text", "vehicle_model_query"],
        },
      },
    },
    ...(reminderTargets.length > 0
      ? [
          {
            type: "function" as const,
            function: {
              name: "create_workshop_reminder",
              description:
                "Cria um lembrete no app: aparece no modal Lembretes do Pátio (veículos) ou Lembretes do Laboratório (módulos), conforme o target. Use sempre que o usuário pedir para criar, gravar ou anotar um lembrete da oficina.",
              parameters: {
                type: "object",
                properties: {
                  text: {
                    type: "string",
                    description: "Texto do lembrete (o que não esquecer).",
                  },
                  target: {
                    type: "string",
                    enum: reminderTargets,
                    description:
                      "patio = lista do modal Lembretes do Pátio; laboratorio = lista do modal Lembretes do Laboratório.",
                  },
                },
                required: ["text", "target"],
              },
            },
          },
        ]
      : []),
  ];
}

export function chatToolsToRealtime(
  tools: ReturnType<typeof buildAssistantChatTools>
): Array<{ type: "function"; name: string; description?: string; parameters?: unknown }> {
  return tools.map((t) => ({
    type: "function" as const,
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
}
