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
  /** Recados gerência ↔ técnicos (ferramentas condicionais). */
  relaySessionRole?: "management" | "technician" | "none";
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

  const relayRole = userContext?.relaySessionRole ?? "none";
  const relayBlock =
    relayRole === "management"
      ? `\nRecados para a equipe: você pode registrar recados da gerência para um técnico (login exato) ou para todos os técnicos. Use list_technicians_for_zaya_relay para ver logins; zaya_send_relay_to_technician com message e recipient_all true OU recipient_username. Quando a gerência receber recado de técnico, use zaya_submit_relay_reply com message_id e reply_text para registrar a resposta.`
      : relayRole === "technician"
        ? `\nRecados: o técnico pode enviar mensagem à gerência com zaya_send_relay_to_management (message). Para responder a um recado da gerência já exibido, use zaya_submit_relay_reply (message_id, reply_text).`
        : "";

  return `Você é ${assistantName}, a assistente virtual do app Rei do ABS (gestão de oficina). Apresente-se pelo nome quando fizer sentido. Responda em português do Brasil, de forma breve, direta e útil. Evite despedidas longas ou ofertas genéricas de ajuda (ex.: "se precisar de mais alguma coisa", "estou à disposição", "qualquer coisa é só chamar"); quando a resposta estiver completa, pode encerrar sem frase de fechamento ou com uma linha só se fizer sentido.${nameBlock}${relayBlock}
O usuário só pode acessar estas abas: ${allowedTabs.join(", ")}.
Use navigate_to_tab para mudar de tela; open_settings para tema/efeitos.
Explique passo a passo quando pedirem "como fazer" algo no app (cadastro, orçamento, etc.), combinando com as ferramentas quando fizer sentido.

Etapas do fluxo (IDs exatos):
${stageCatalog}

Central de notificações (oficina inteira): list_notifications, get_unread_notifications_count, mark_notification_read, mark_all_notifications_read, clear_all_notifications (só se o usuário pedir para apagar tudo). Ferramentas principais: create_workshop_reminder, list_workshop_reminders (ler), update_workshop_reminder (editar texto ou marcar concluído), delete_workshop_reminder (excluir) — sempre com target patio ou laboratorio conforme o modal; open_patio_vehicle_modal (abrir modal do veículo no Pátio pelo nome do carro — também encontra OS arquivadas/entregues se não houver em aberto; veja regra de nome do cliente abaixo); open_patio_vehicle_budget_view (abrir o Pátio e exibir o modal de leitura do orçamento do veículo; se vários orçamentos na mesma OS, a ferramenta retorna lista — pergunte qual o usuário quer e chame de novo com budget_index: 1 = mais recente, ou budget_id); get_customer_complaint_for_vehicle (ler a queixa do cliente; OS arquivada: só leitura); append_complaint_to_vehicle (acrescentar ao final da queixa; nunca apaga o que já estava; não use em OS arquivada); set_vehicle_technician (atribuir, trocar ou retirar técnico no card do veículo; clear_technician para remover; technician_user_id ou technician_username para atribuir/trocar); open_patio_vehicle_history (abrir o modal de histórico de arquivados no Pátio ou Laboratório); list_archived_vehicle_orders (listar OS com status CANCELLED); unarchive_vehicle_service_order (desarquivar: CANCELLED → FINALIZADO, como o botão no histórico); list_vehicles_in_stage (por etapa; use status CANCELLED para listar arquivados/entregues — alternativa a list_archived_vehicle_orders); update_service_order_status (mudar etapa; id/os_number/placa); search_service_orders (busca texto em OS abertas e arquivadas); list_orders_by_technician (only_mine ou técnico); list_upcoming_deliveries; count_orders_by_stage; count_customer_open_orders; add_service_order_comment; get_service_order_comments; get_service_order_budgets; create_service_order_budget_simple; update_service_order_budget; add_service_order_budget_items; list_appointments; create_appointment (data AAAA-MM-DD); register_customer_vehicle_intake (cadastro rápido Recepção); search_customers.
Quando o usuário pedir para ver, abrir ou mostrar um orçamento de um carro no Pátio, use open_patio_vehicle_budget_view (não só open_patio_vehicle_modal). Com sucesso, o app abre o orçamento no Pátio sem fechar o chat da Zaya. Para editar orçamento ou adicionar peças/serviços dentro dele, obtenha antes o `budget_id` com open_patio_vehicle_budget_view e em seguida use update_service_order_budget ou add_service_order_budget_items.

Queixa do cliente (campo issue_description na OS): use get_customer_complaint_for_vehicle para ler o texto atual. Para acrescentar informação, use append_complaint_to_vehicle — ela só concatena ao final do que já estava escrito. Nunca apague, substitua nem sobrescreva a queixa existente; não há ferramenta para apagar ou reescrever esse campo por completo.

Veículos por modelo (open_patio_vehicle_modal, orçamento, queixa, técnico): não pergunte o nome do cliente antes de chamar a ferramenta. Chame primeiro só com vehicle_model_query; somente se a resposta vier ambiguous (mais de uma OS com aquele veículo), pergunte o nome do cliente e chame de novo com customer_name_query. Se a ferramenta indicar uma única OS, continue sem pedir nome.

Histórico de arquivados (entregues): use open_patio_vehicle_history para abrir a mesma tela do botão de histórico no Pátio/Laboratório. Para só listar dados no chat, use list_archived_vehicle_orders ou list_vehicles_in_stage com status CANCELLED. Para desarquivar uma OS (voltar ao fluxo ativo na etapa Finalizado), use unarchive_vehicle_service_order com id, número da OS ou placa.
Não invente dados: use só retorno das ferramentas. Datas em ISO AAAA-MM-DD.`;
}

/** Instruções extras para voz na Realtime API (tom mais humano). */
export const ASSISTANT_REALTIME_VOICE_ADDENDUM = `
No modo voz: seja natural e direta, como alguém da oficina; evite tom de robô, listas longas e encerramentos genéricos ("estou à disposição", "se precisar de algo mais", etc.); responda só o necessário e termine sem preâmbulos nem despedidas forçadas.
Se a mensagem do usuário começar exatamente com o prefixo "[RECADO_ZAYA]", leia em voz alta apenas o texto que vem depois do prefixo e de uma quebra de linha, de forma natural e breve, sem dizer "vou ler" nem repetir o prefixo.`;

export function buildAssistantChatTools(
  allowedTabs: string[],
  statusEnum: string[],
  options?: { relaySessionRole?: "management" | "technician" | "none" }
) {
  const reminderTargets: ("patio" | "laboratorio")[] = [];
  if (allowedTabs.includes("patio")) reminderTargets.push("patio");
  if (allowedTabs.includes("laboratorio")) reminderTargets.push("laboratorio");

  const relaySessionRole = options?.relaySessionRole ?? "none";
  const relayReplyTool = {
    type: "function" as const,
    function: {
      name: "zaya_submit_relay_reply",
      description:
        "Registra a resposta a um recado já mostrado (UUID message_id vindo do sistema ou da conversa). Use após o usuário dizer como quer responder.",
      parameters: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "UUID do recado." },
          reply_text: { type: "string", description: "Texto da resposta." },
        },
        required: ["message_id", "reply_text"],
      },
    },
  };
  const relayManagementTools =
    relaySessionRole === "management"
      ? [
          {
            type: "function" as const,
            function: {
              name: "list_technicians_for_zaya_relay",
              description:
                "Lista técnicos da oficina (login/username e nome) para enviar recado a uma pessoa específica.",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function" as const,
            function: {
              name: "zaya_send_relay_to_technician",
              description:
                "Envia recado da gerência para um técnico (recipient_username = login exato) ou para todos (recipient_all: true). Obrigatório message com o texto.",
              parameters: {
                type: "object",
                properties: {
                  message: { type: "string", description: "Texto do recado." },
                  recipient_all: {
                    type: "boolean",
                    description: "Se true, envia a todos os técnicos; se false, informe recipient_username.",
                  },
                  recipient_username: {
                    type: "string",
                    description: "Login do técnico (obrigatório se recipient_all for false).",
                  },
                },
                required: ["message", "recipient_all"],
              },
            },
          },
          relayReplyTool,
        ]
      : [];
  const relayTechnicianTools =
    relaySessionRole === "technician"
      ? [
          {
            type: "function" as const,
            function: {
              name: "zaya_send_relay_to_management",
              description: "Envia recado do técnico à gerência. Texto completo em message.",
              parameters: {
                type: "object",
                properties: {
                  message: { type: "string", description: "Texto do recado à gerência." },
                },
                required: ["message"],
              },
            },
          },
          relayReplyTool,
        ]
      : [];

  const relayTools = [...relayManagementTools, ...relayTechnicianTools].filter(
    (t, i, arr) => arr.findIndex((x) => x.function.name === t.function.name) === i
  );

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
        name: "list_notifications",
        description:
          "Lista todas as notificações da oficina (admin e técnicos): comentários, etapas, orçamentos, etc. Cada item tem id, type, payload, lida ou não, target_type/target_slug (destino).",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              description: "Máximo de itens (padrão 50, máx. 100).",
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_unread_notifications_count",
        description: "Quantas notificações não lidas existem no total na oficina.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "mark_notification_read",
        description: "Marca uma notificação como lida pelo id (UUID).",
        parameters: {
          type: "object",
          properties: {
            notification_id: { type: "string", description: "UUID da notificação." },
          },
          required: ["notification_id"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "mark_all_notifications_read",
        description: "Marca todas as notificações da oficina como lidas.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "clear_all_notifications",
        description:
          "APAGA todas as notificações da oficina (irreversível). Só use se o usuário pedir explicitamente para limpar a central.",
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
        name: "update_service_order_budget",
        description:
          "Edita um orçamento existente: mantém aprovações quando approved não é fornecido e substitui diagnóstico/serviços/peças/observações pelos campos informados (preserva quando omitidos).",
        parameters: {
          type: "object",
          properties: {
            budget_id: { type: "string", description: "UUID do orçamento a editar." },
            service_order_id: { type: "string", description: "UUID da OS (opcional se você informar os_number ou plate)." },
            os_number: { type: "integer" },
            plate: { type: "string" },
            card_name: { type: "string", description: "Nome do cartão do orçamento (ex.: Civic, Gol)." },
            diagnosis: { type: "string" },
            services: {
              type: "array",
              description: "Lista completa de serviços do orçamento.",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  approved: { type: "boolean", description: "Aprovado pelo admin (opcional)." },
                },
                required: ["description"],
              },
            },
            parts: {
              type: "array",
              description: "Lista completa de peças do orçamento.",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  quantity: { type: "string", description: "Quantidade (string numérica)." },
                  approved: { type: "boolean", description: "Aprovado pelo admin (opcional)." },
                },
                required: ["description", "quantity"],
              },
            },
            observations: { type: "string", description: "Observações do orçamento." },
          },
          required: ["budget_id"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "add_service_order_budget_items",
        description:
          "Adiciona serviços e/ou peças a um orçamento existente (mantém itens já existentes; aprovações dos existentes são preservadas).",
        parameters: {
          type: "object",
          properties: {
            budget_id: { type: "string", description: "UUID do orçamento a editar." },
            service_order_id: { type: "string", description: "UUID da OS (opcional se você informar os_number ou plate)." },
            os_number: { type: "integer" },
            plate: { type: "string" },
            services_to_add: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                },
                required: ["description"],
              },
            },
            parts_to_add: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  quantity: { type: "string", description: "Quantidade (string numérica)." },
                },
                required: ["description", "quantity"],
              },
            },
            card_name: { type: "string", description: "Se fornecido, substitui o cardName do orçamento." },
            diagnosis: { type: "string", description: "Se fornecido, substitui o diagnóstico do orçamento." },
            observations: { type: "string", description: "Se fornecido, substitui as observações do orçamento." },
          },
          required: ["budget_id"],
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
          "Abre o modal do veículo na página Pátio. Use vehicle_model_query (ex.: Civic, Gol). Não pergunte o nome do cliente antes: chame só com vehicle_model_query; se retornar ambiguous (várias OS), aí sim pergunte o nome e use customer_name_query.",
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
        name: "get_customer_complaint_for_vehicle",
        description:
          "Lê o texto atual da queixa do cliente (issue_description). Chame com vehicle_model_query primeiro; customer_name_query só se ambiguous (vários veículos). Em OS arquivada, só leitura.",
        parameters: {
          type: "object",
          properties: {
            vehicle_model_query: {
              type: "string",
              description: "Nome ou modelo do carro para localizar a OS.",
            },
            customer_name_query: {
              type: "string",
              description: "Se houver vários carros iguais, parte do nome do cliente.",
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
          "Acrescenta texto ao final da queixa (nunca apaga o existente). Use vehicle_model_query e complaint_text; customer_name_query só se a resposta anterior foi ambiguous (vários veículos). Não use em OS arquivada.",
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
    {
      type: "function" as const,
      function: {
        name: "set_vehicle_technician",
        description:
          "Atribui, troca ou remove o técnico responsável pelo card do veículo no Pátio. Localiza a OS por vehicle_model_query (não pergunte nome do cliente antes; customer_name_query só se a ferramenta retornar ambiguous com várias OS). Para remover: clear_technician: true. Para atribuir ou trocar: technician_user_id (UUID do usuário técnico) ou technician_username (login ou nome). Se retornar ambiguous_tecnico, pergunte qual técnico ou repita com technician_user_id exato.",
        parameters: {
          type: "object",
          properties: {
            vehicle_model_query: {
              type: "string",
              description: "Nome ou modelo do carro para localizar a OS.",
            },
            customer_name_query: {
              type: "string",
              description: "Só quando a busca por veículo retornou ambiguous (mais de uma OS).",
            },
            clear_technician: {
              type: "boolean",
              description: "true = retirar técnico do card (fica sem responsável).",
            },
            technician_user_id: {
              type: "string",
              description: "UUID do técnico (workshop_system_users.id) para atribuir ou trocar.",
            },
            technician_username: {
              type: "string",
              description: "Login ou nome exibido do técnico, se não tiver o UUID.",
            },
          },
          required: ["vehicle_model_query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "open_patio_vehicle_history",
        description:
          "Abre o modal de histórico de veículos arquivados (Pátio) ou módulos arquivados (Laboratório), onde o usuário busca e pode desarquivar. Use target patio (padrão) ou laboratorio.",
        parameters: {
          type: "object",
          properties: {
            target: {
              type: "string",
              enum: ["patio", "laboratorio"],
              description: "patio = histórico de veículos; laboratorio = histórico de módulos.",
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_archived_vehicle_orders",
        description:
          "Lista ordens de serviço arquivadas (entregues), status CANCELLED. Mesmo dado exibido no histórico do Pátio/Laboratório. order_type vehicle = Pátio; module = Laboratório.",
        parameters: {
          type: "object",
          properties: {
            order_type: {
              type: "string",
              enum: ["vehicle", "module"],
              description: "vehicle = veículos no Pátio; module = módulos no Laboratório.",
            },
          },
          required: ["order_type"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "unarchive_vehicle_service_order",
        description:
          "Desarquiva uma OS: remove o arquivamento (status CANCELLED) e coloca na etapa FINALIZADO, como o botão Desarquivar no histórico. Informe service_order_id (UUID), ou os_number, ou plate do veículo.",
        parameters: {
          type: "object",
          properties: {
            service_order_id: { type: "string", description: "UUID da OS." },
            os_number: { type: "integer", description: "Número da OS no app." },
            plate: { type: "string", description: "Placa (veículos)." },
          },
          required: [],
        },
      },
    },
    ...relayTools,
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
          {
            type: "function" as const,
            function: {
              name: "list_workshop_reminders",
              description:
                "Lista os lembretes salvos do Pátio ou do Laboratório (cada item tem id, texto, concluído, data). Use antes de editar ou excluir para obter o id.",
              parameters: {
                type: "object",
                properties: {
                  target: {
                    type: "string",
                    enum: reminderTargets,
                    description: "patio ou laboratorio.",
                  },
                },
                required: ["target"],
              },
            },
          },
          {
            type: "function" as const,
            function: {
              name: "delete_workshop_reminder",
              description: "Remove um lembrete pelo id (UUID retornado em list_workshop_reminders).",
              parameters: {
                type: "object",
                properties: {
                  target: {
                    type: "string",
                    enum: reminderTargets,
                    description: "patio ou laboratorio.",
                  },
                  reminder_id: {
                    type: "string",
                    description: "UUID do lembrete (campo id na listagem).",
                  },
                },
                required: ["target", "reminder_id"],
              },
            },
          },
          {
            type: "function" as const,
            function: {
              name: "update_workshop_reminder",
              description:
                "Edita o texto do lembrete e/ou marca como concluído (done: true) ou reabre (done: false).",
              parameters: {
                type: "object",
                properties: {
                  target: {
                    type: "string",
                    enum: reminderTargets,
                    description: "patio ou laboratorio.",
                  },
                  reminder_id: {
                    type: "string",
                    description: "UUID do lembrete.",
                  },
                  text: {
                    type: "string",
                    description: "Novo texto completo do lembrete (opcional).",
                  },
                  done: {
                    type: "boolean",
                    description: "true = concluído/riscado; false = voltar a pendente (opcional).",
                  },
                },
                required: ["target", "reminder_id"],
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
