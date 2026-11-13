/**
 * SEC-03.0 — catálogo declarativo de autorização.
 *
 * Nenhuma família nasce em bloqueio. A oficina continua igual até um PR
 * futuro mudar `mode` de uma família para "shadow" e, só depois, "enforce".
 *
 * A chave de aba não libera outra ação: cada regra lista as chaves daquela
 * ação. `anyOf` vazio significa só Gerência ou full_access.
 * Rota sem regra continua aberta (`unmatched: "ignore"`) até a família
 * ser classificada por completo.
 */

export const PERMISSION_KEYS = [
  "full_access",
  "access_home",
  "access_reception",
  "access_agenda",
  "access_patio",
  "access_laboratorio",
  "access_orcamentos",
  "access_tv_patio",
  "access_estoque_pecas",
  "access_relatorios",
  "access_boletim_erros",
  "access_radar_qualidade",
  "access_servicos_oficina",
  "access_checklists_patio",
  "access_notificacoes_sistema",
  "access_settings",
  "access_change_passwords",
  "access_technicians",
  "patio_delete_cards",
  "patio_assign_technician",
  "patio_edit_ficha",
  "patio_edit_queixa",
  "patio_edit_delivery_date",
  "patio_edit_mileage",
  "patio_edit_budgets",
  "patio_approve_budget_items",
  "patio_add_comments",
  "patio_archive_card",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type AuthAction = "read" | "create" | "update" | "delete" | "approve" | "move";

export type FamilyMode = "off" | "shadow" | "enforce";

export type AuthorizationFamilyId =
  | "customers"
  | "appointments"
  | "service_orders"
  | "budgets"
  | "comments"
  | "photos"
  | "parts_stock"
  | "abs_stock"
  | "technicians"
  | "workshop_catalogs"
  | "tv_admin"
  | "bulletins"
  | "reports"
  | "notifications"
  | "quality_radar"
  | "rda";

export type AuthorizationRule = {
  id: string;
  family: AuthorizationFamilyId;
  action: AuthAction;
  methods: readonly string[];
  path: RegExp;
  anyOf: readonly PermissionKey[];
  priority: number;
  /** Herança de chave de ação. Não herda aba visual. */
  inherit?: "approve_budget_items";
  /**
   * session_user: a rota é o próprio usuário da sessão, depois de confirmá-lo na oficina.
   * linked_technician: o id da URL é o técnico ligado a essa sessão em
   * workshop_quality_person_links. Nome parecido não cria vínculo.
   */
  ownership?: "session_user" | "linked_technician";
  /**
   * Campos que o vínculo próprio pode gravar. Qualquer outro campo na mesma
   * requisição nega o pedido inteiro. Gerência e a chave administrativa não usam esta lista.
   */
  selfFields?: readonly string[];
};

export type AuthorizationFamily = {
  id: AuthorizationFamilyId;
  mode: FamilyMode;
  /**
   * ignore: sem regra, a rota segue como hoje.
   * deny: prefixo da família sem regra passa a negar quando mode é enforce.
   */
  unmatched: "ignore" | "deny";
  prefixes: readonly string[];
};

export type AuthorizationPolicy = {
  families: readonly AuthorizationFamily[];
  rules: readonly AuthorizationRule[];
};

const CUSTOMER_KEYS = [
  "access_reception",
  "access_orcamentos",
  "access_patio",
  "access_laboratorio",
] as const satisfies readonly PermissionKey[];

const AGENDA_KEYS = ["access_agenda", "access_reception"] as const satisfies readonly PermissionKey[];

const OS_READ_KEYS = [
  "access_patio",
  "access_laboratorio",
  "access_reception",
  "access_orcamentos",
] as const satisfies readonly PermissionKey[];

const OS_CREATE_KEYS = [
  "access_patio",
  "access_laboratorio",
  "access_reception",
] as const satisfies readonly PermissionKey[];

const LAB_KEYS = ["access_laboratorio"] as const satisfies readonly PermissionKey[];

const STOCK_WRITE = ["access_estoque_pecas"] as const satisfies readonly PermissionKey[];

const STOCK_MOVE = [
  "access_estoque_pecas",
  "access_patio",
  "access_laboratorio",
] as const satisfies readonly PermissionKey[];

const PART_READ = [
  "access_estoque_pecas",
  "access_patio",
  "access_laboratorio",
  "access_orcamentos",
  "access_reception",
] as const satisfies readonly PermissionKey[];

const BUDGET_WRITE = ["patio_edit_budgets", "access_orcamentos"] as const satisfies readonly PermissionKey[];

const BUDGET_READ = [
  "patio_edit_budgets",
  "access_orcamentos",
  "access_patio",
  "access_laboratorio",
  "access_reception",
] as const satisfies readonly PermissionKey[];

const COMMENT_WRITE = [
  "patio_add_comments",
  "access_reception",
  "access_laboratorio",
  "access_orcamentos",
] as const satisfies readonly PermissionKey[];

const COMMENT_READ = [
  "patio_add_comments",
  "access_patio",
  "access_laboratorio",
  "access_reception",
  "access_orcamentos",
] as const satisfies readonly PermissionKey[];

const TECH_READ = [
  "access_technicians",
  "patio_assign_technician",
  "access_patio",
  "access_laboratorio",
  "access_radar_qualidade",
] as const satisfies readonly PermissionKey[];

const SERVICE_READ = [
  "access_servicos_oficina",
  "access_patio",
  "access_laboratorio",
  "access_orcamentos",
] as const satisfies readonly PermissionKey[];

const CHECKLIST_READ = [
  "access_checklists_patio",
  "access_patio",
  "access_laboratorio",
] as const satisfies readonly PermissionKey[];

function rule(init: {
  id: string;
  family: AuthorizationFamilyId;
  action: AuthAction;
  methods: readonly string[];
  path: string;
  anyOf?: readonly PermissionKey[];
  priority?: number;
  inherit?: "approve_budget_items";
  ownership?: "session_user" | "linked_technician";
  selfFields?: readonly string[];
}): AuthorizationRule {
  return {
    id: init.id,
    family: init.family,
    action: init.action,
    methods: init.methods.map((method) => method.toUpperCase()),
    path: new RegExp(init.path),
    anyOf: init.anyOf ?? [],
    priority: init.priority ?? 50,
    inherit: init.inherit,
    ownership: init.ownership,
    selfFields: init.selfFields,
  };
}

function crud(
  family: AuthorizationFamilyId,
  idPrefix: string,
  path: string,
  anyOf: readonly PermissionKey[],
  priority = 50
): AuthorizationRule[] {
  return [
    rule({ id: `${idPrefix}_read`, family, action: "read", methods: ["GET"], path, anyOf, priority }),
    rule({ id: `${idPrefix}_create`, family, action: "create", methods: ["POST"], path, anyOf, priority }),
    rule({
      id: `${idPrefix}_update`,
      family,
      action: "update",
      methods: ["PUT", "PATCH"],
      path,
      anyOf,
      priority,
    }),
    rule({ id: `${idPrefix}_delete`, family, action: "delete", methods: ["DELETE"], path, anyOf, priority }),
  ];
}

function family(
  id: AuthorizationFamilyId,
  prefixes: readonly string[],
  mode: "off" | "shadow" = "off"
): AuthorizationFamily {
  return { id, mode, unmatched: "ignore", prefixes };
}

const FAMILIES: readonly AuthorizationFamily[] = [
  family("customers", ["/api/customers", "/api/consulta-placa"]),
  family("appointments", ["/api/appointments"]),
  family("service_orders", ["/api/service-orders"]),
  family("budgets", ["/api/service-orders", "/api/patio-budgets-hub", "/api/patio-vehicle-budgets-aggregate"]),
  family("comments", ["/api/service-orders"]),
  family("photos", ["/api/service-orders"]),
  family("parts_stock", ["/api/workshop-parts", "/api/workshop-suppliers", "/api/workshop-part-categories", "/api/estoque"]),
  family("abs_stock", ["/api/abs-modules", "/api/abs-module-models"]),
  // SEC-03.1: só observação. Leitura operacional não usa a chave de edição.
  family("technicians", ["/api/workshop-technicians"], "shadow"),
  family("workshop_catalogs", ["/api/workshop-services", "/api/workshop/checklist-templates"], "shadow"),
  family("tv_admin", ["/api/tv"], "shadow"),
  family("bulletins", ["/api/error-bulletins"]),
  family("reports", ["/api/reports"]),
  family("notifications", ["/api/notifications"]),
  family("quality_radar", ["/api/quality-"]),
  family("rda", ["/api/rda"]),
];

/**
 * Regras prontas para um PR futuro ligar a família.
 * Fotos, Radar e RDA ficam sem regra nova: foto não tem chave de ação,
 * e Radar/RDA já conferem permissão nos handlers atuais.
 * O PUT genérico da OS também fica de fora: a mesma rota mistura etapa e ficha.
 */
const RULES: readonly AuthorizationRule[] = [
  ...crud("customers", "customers", "^/api/customers$", CUSTOMER_KEYS, 40),
  ...crud("customers", "customer", "^/api/customers/[^/]+$", CUSTOMER_KEYS, 40),
  rule({
    id: "consulta_placa_read",
    family: "customers",
    action: "read",
    methods: ["POST"],
    path: "^/api/consulta-placa$",
    anyOf: CUSTOMER_KEYS,
  }),

  ...crud("appointments", "appointments", "^/api/appointments$", AGENDA_KEYS, 40),
  ...crud("appointments", "appointment", "^/api/appointments/[^/]+$", AGENDA_KEYS, 40),

  rule({
    id: "os_list_read",
    family: "service_orders",
    action: "read",
    methods: ["GET"],
    path: "^/api/service-orders$",
    anyOf: OS_READ_KEYS,
    priority: 40,
  }),
  rule({
    id: "os_create",
    family: "service_orders",
    action: "create",
    methods: ["POST"],
    path: "^/api/service-orders$",
    anyOf: OS_CREATE_KEYS,
    priority: 40,
  }),
  rule({
    id: "os_item_read",
    family: "service_orders",
    action: "read",
    methods: ["GET"],
    path: "^/api/service-orders/[^/]+$",
    anyOf: OS_READ_KEYS,
    priority: 20,
  }),
  rule({
    id: "os_assign_technician",
    family: "service_orders",
    action: "update",
    methods: ["PUT"],
    path: "^/api/service-orders/[^/]+/service-technicians$",
    anyOf: ["patio_assign_technician"],
    priority: 80,
  }),
  rule({
    id: "os_delete_card",
    family: "service_orders",
    action: "delete",
    methods: ["POST"],
    path: "^/api/service-orders/[^/]+/delete-with-password$",
    anyOf: ["patio_delete_cards"],
    priority: 80,
  }),
  rule({
    id: "os_bench_move",
    family: "service_orders",
    action: "move",
    methods: ["PUT"],
    path: "^/api/service-orders/[^/]+/bench-slot$",
    anyOf: LAB_KEYS,
    priority: 80,
  }),
  rule({
    id: "os_shelf_move",
    family: "service_orders",
    action: "move",
    methods: ["PUT"],
    path: "^/api/service-orders/[^/]+/oficina-shelf$",
    anyOf: LAB_KEYS,
    priority: 80,
  }),
  rule({
    id: "os_oficina_saida",
    family: "service_orders",
    action: "move",
    methods: ["POST"],
    path: "^/api/service-orders/[^/]+/oficina-saida$",
    anyOf: LAB_KEYS,
    priority: 80,
  }),
  rule({
    id: "os_oficina_retorno",
    family: "service_orders",
    action: "move",
    methods: ["POST"],
    path: "^/api/service-orders/[^/]+/oficina-retorno$",
    anyOf: LAB_KEYS,
    priority: 80,
  }),
  rule({
    id: "os_external_repair",
    family: "service_orders",
    action: "update",
    methods: ["PUT"],
    path: "^/api/service-orders/[^/]+/external-repair$",
    anyOf: LAB_KEYS,
    priority: 80,
  }),
  rule({
    id: "os_lab_evaluation_create",
    family: "service_orders",
    action: "create",
    methods: ["POST"],
    path: "^/api/service-orders/[^/]+/lab-evaluation$",
    anyOf: LAB_KEYS,
    priority: 80,
  }),
  rule({
    id: "os_lab_evaluation_delete",
    family: "service_orders",
    action: "delete",
    methods: ["DELETE"],
    path: "^/api/service-orders/[^/]+/lab-evaluation$",
    anyOf: LAB_KEYS,
    priority: 80,
  }),

  rule({
    id: "budget_list_read",
    family: "budgets",
    action: "read",
    methods: ["GET"],
    path: "^/api/service-orders/[^/]+/budgets$",
    anyOf: BUDGET_READ,
    priority: 70,
  }),
  rule({
    id: "budget_create",
    family: "budgets",
    action: "create",
    methods: ["POST"],
    path: "^/api/service-orders/[^/]+/budgets$",
    anyOf: BUDGET_WRITE,
    priority: 70,
  }),
  rule({
    id: "budget_item_read",
    family: "budgets",
    action: "read",
    methods: ["GET"],
    path: "^/api/service-orders/[^/]+/budgets/[^/]+$",
    anyOf: BUDGET_READ,
    priority: 70,
  }),
  rule({
    id: "budget_update",
    family: "budgets",
    action: "update",
    methods: ["PUT", "PATCH"],
    path: "^/api/service-orders/[^/]+/budgets/[^/]+$",
    anyOf: BUDGET_WRITE,
    priority: 70,
  }),
  rule({
    id: "budget_delete",
    family: "budgets",
    action: "delete",
    methods: ["DELETE"],
    path: "^/api/service-orders/[^/]+/budgets/[^/]+$",
    anyOf: BUDGET_WRITE,
    priority: 70,
  }),
  rule({
    id: "budget_approve",
    family: "budgets",
    action: "approve",
    methods: ["POST"],
    path: "^/api/service-orders/[^/]+/budgets/[^/]+/verify$",
    anyOf: ["patio_approve_budget_items"],
    priority: 90,
    inherit: "approve_budget_items",
  }),
  rule({
    id: "budget_hub_read",
    family: "budgets",
    action: "read",
    methods: ["GET"],
    path: "^/api/patio-budgets-hub/live$",
    anyOf: BUDGET_READ,
    priority: 40,
  }),
  rule({
    id: "budget_aggregate_read",
    family: "budgets",
    action: "read",
    methods: ["GET"],
    path: "^/api/patio-vehicle-budgets-aggregate$",
    anyOf: BUDGET_READ,
    priority: 40,
  }),

  rule({
    id: "comment_create",
    family: "comments",
    action: "create",
    methods: ["POST"],
    path: "^/api/service-orders/[^/]+/comments$",
    anyOf: COMMENT_WRITE,
    priority: 80,
  }),
  rule({
    id: "comment_update",
    family: "comments",
    action: "update",
    methods: ["PATCH", "PUT"],
    path: "^/api/service-orders/[^/]+/comments/[^/]+$",
    anyOf: COMMENT_WRITE,
    priority: 70,
  }),
  rule({
    id: "comment_delete",
    family: "comments",
    action: "delete",
    methods: ["DELETE"],
    path: "^/api/service-orders/[^/]+/comments/[^/]+$",
    anyOf: COMMENT_WRITE,
    priority: 70,
  }),
  rule({
    id: "comment_read_state",
    family: "comments",
    action: "read",
    methods: ["POST"],
    path: "^/api/service-orders/[^/]+/comments/(?:read|[^/]+/(?:view|reactions))$",
    anyOf: COMMENT_READ,
    priority: 90,
  }),

  rule({
    id: "parts_move",
    family: "parts_stock",
    action: "move",
    methods: ["POST"],
    path: "^/api/workshop-parts/movements$",
    anyOf: STOCK_MOVE,
    priority: 100,
  }),
  rule({
    id: "parts_move_read",
    family: "parts_stock",
    action: "read",
    methods: ["GET"],
    path: "^/api/workshop-parts/movements$",
    anyOf: STOCK_MOVE,
    priority: 100,
  }),
  rule({
    id: "parts_move_delete",
    family: "parts_stock",
    action: "delete",
    methods: ["DELETE"],
    path: "^/api/workshop-parts/movements/[^/]+$",
    anyOf: STOCK_WRITE,
    priority: 100,
  }),
  rule({
    id: "parts_guard_check",
    family: "parts_stock",
    action: "move",
    methods: ["POST"],
    path: "^/api/workshop-parts/verify-stock-guard$",
    anyOf: STOCK_MOVE,
    priority: 100,
  }),
  rule({
    id: "parts_lookup_read",
    family: "parts_stock",
    action: "read",
    methods: ["GET"],
    path: "^/api/workshop-parts/(?:lookup|search|pending-reservations)$",
    anyOf: PART_READ,
    priority: 90,
  }),
  rule({
    id: "parts_analytics_read",
    family: "parts_stock",
    action: "read",
    methods: ["GET"],
    path: "^/api/workshop-parts/analytics$",
    anyOf: ["access_estoque_pecas", "access_relatorios"],
    priority: 90,
  }),
  ...crud("parts_stock", "parts", "^/api/workshop-parts$", STOCK_WRITE, 40),
  rule({
    id: "parts_collection_read_shared",
    family: "parts_stock",
    action: "read",
    methods: ["GET"],
    path: "^/api/workshop-parts$",
    anyOf: PART_READ,
    priority: 45,
  }),
  ...crud("parts_stock", "part", "^/api/workshop-parts/[^/]+$", STOCK_WRITE, 30),
  rule({
    id: "part_item_read_shared",
    family: "parts_stock",
    action: "read",
    methods: ["GET"],
    path: "^/api/workshop-parts/[^/]+$",
    anyOf: PART_READ,
    priority: 35,
  }),
  ...crud("parts_stock", "part_photo", "^/api/workshop-parts/[^/]+/photo$", STOCK_WRITE, 80),
  ...crud("parts_stock", "part_photo_item", "^/api/workshop-parts/[^/]+/photos/[^/]+$", STOCK_WRITE, 80),
  ...crud("parts_stock", "part_purchases", "^/api/workshop-parts/[^/]+/purchases$", STOCK_WRITE, 80),
  ...crud("parts_stock", "part_purchase", "^/api/workshop-parts/[^/]+/purchases/[^/]+$", STOCK_WRITE, 80),
  rule({
    id: "part_receive",
    family: "parts_stock",
    action: "update",
    methods: ["POST"],
    path: "^/api/workshop-parts/[^/]+/receive$",
    anyOf: STOCK_WRITE,
    priority: 80,
  }),
  rule({
    id: "part_categories_set",
    family: "parts_stock",
    action: "update",
    methods: ["PUT"],
    path: "^/api/workshop-parts/[^/]+/categories$",
    anyOf: STOCK_WRITE,
    priority: 80,
  }),
  ...crud("parts_stock", "suppliers", "^/api/workshop-suppliers$", STOCK_WRITE, 40),
  ...crud("parts_stock", "supplier", "^/api/workshop-suppliers/[^/]+$", STOCK_WRITE, 40),
  ...crud("parts_stock", "part_categories", "^/api/workshop-part-categories$", STOCK_WRITE, 40),
  ...crud("parts_stock", "part_category", "^/api/workshop-part-categories/[^/]+$", STOCK_WRITE, 40),
  rule({
    id: "estoque_ledger_read",
    family: "parts_stock",
    action: "read",
    methods: ["GET"],
    path: "^/api/estoque/ledger$",
    anyOf: STOCK_WRITE,
    priority: 40,
  }),

  ...crud("abs_stock", "abs_modules", "^/api/abs-modules$", LAB_KEYS, 40),
  ...crud("abs_stock", "abs_module", "^/api/abs-modules/.+$", LAB_KEYS, 30),
  ...crud("abs_stock", "abs_models", "^/api/abs-module-models$", LAB_KEYS, 40),
  ...crud("abs_stock", "abs_model", "^/api/abs-module-models/.+$", LAB_KEYS, 30),

  rule({
    id: "technicians_read",
    family: "technicians",
    action: "read",
    methods: ["GET"],
    path: "^/api/workshop-technicians(?:/[^/]+)?$",
    anyOf: TECH_READ,
    priority: 40,
  }),
  rule({
    id: "technicians_create",
    family: "technicians",
    action: "create",
    methods: ["POST"],
    path: "^/api/workshop-technicians$",
    anyOf: ["access_technicians"],
    priority: 40,
  }),
  rule({
    id: "technicians_update",
    family: "technicians",
    action: "update",
    methods: ["PUT", "PATCH"],
    path: "^/api/workshop-technicians/[^/]+$",
    anyOf: ["access_technicians"],
    ownership: "linked_technician",
    // color_style é a cor do card no cadastro administrativo, não a cor pessoal.
    selfFields: ["name"],
    priority: 40,
  }),
  rule({
    id: "technicians_delete",
    family: "technicians",
    action: "delete",
    methods: ["DELETE"],
    path: "^/api/workshop-technicians/[^/]+$",
    anyOf: ["access_technicians"],
    priority: 40,
  }),
  rule({
    id: "technicians_photo",
    family: "technicians",
    action: "update",
    methods: ["POST"],
    path: "^/api/workshop-technicians/[^/]+/photo$",
    anyOf: ["access_technicians"],
    ownership: "linked_technician",
    priority: 80,
  }),
  // Perfil do usuário da sessão. Não usa o id enviado pelo navegador.
  rule({
    id: "self_profile_read",
    family: "technicians",
    action: "read",
    methods: ["GET"],
    path: "^/api/auth/my-profile$",
    ownership: "session_user",
    priority: 80,
  }),
  rule({
    id: "self_profile_update",
    family: "technicians",
    action: "update",
    methods: ["PATCH"],
    path: "^/api/auth/my-profile$",
    ownership: "session_user",
    priority: 80,
  }),
  rule({
    id: "self_profile_photo",
    family: "technicians",
    action: "update",
    methods: ["POST"],
    path: "^/api/auth/my-profile/photo$",
    ownership: "session_user",
    priority: 80,
  }),
  rule({
    id: "self_password_update",
    family: "technicians",
    action: "update",
    methods: ["POST"],
    path: "^/api/auth/change-my-password$",
    ownership: "session_user",
    priority: 80,
  }),

  rule({
    id: "services_read",
    family: "workshop_catalogs",
    action: "read",
    methods: ["GET"],
    path: "^/api/workshop-services$",
    anyOf: SERVICE_READ,
    priority: 50,
  }),
  rule({
    id: "service_read",
    family: "workshop_catalogs",
    action: "read",
    methods: ["GET"],
    path: "^/api/workshop-services/[^/]+$",
    anyOf: SERVICE_READ,
    priority: 50,
  }),
  rule({
    id: "services_create",
    family: "workshop_catalogs",
    action: "create",
    methods: ["POST"],
    path: "^/api/workshop-services$",
    anyOf: ["access_servicos_oficina"],
    priority: 40,
  }),
  rule({
    id: "service_update",
    family: "workshop_catalogs",
    action: "update",
    methods: ["PUT", "PATCH"],
    path: "^/api/workshop-services/[^/]+$",
    anyOf: ["access_servicos_oficina"],
    priority: 40,
  }),
  rule({
    id: "service_delete",
    family: "workshop_catalogs",
    action: "delete",
    methods: ["DELETE"],
    path: "^/api/workshop-services/[^/]+$",
    anyOf: ["access_servicos_oficina"],
    priority: 40,
  }),
  rule({
    id: "checklists_read",
    family: "workshop_catalogs",
    action: "read",
    methods: ["GET"],
    path: "^/api/workshop/checklist-templates$",
    anyOf: CHECKLIST_READ,
    priority: 50,
  }),
  rule({
    id: "checklist_read",
    family: "workshop_catalogs",
    action: "read",
    methods: ["GET"],
    path: "^/api/workshop/checklist-templates/[^/]+$",
    anyOf: CHECKLIST_READ,
    priority: 50,
  }),
  rule({
    id: "checklists_create",
    family: "workshop_catalogs",
    action: "create",
    methods: ["POST"],
    path: "^/api/workshop/checklist-templates$",
    anyOf: ["access_checklists_patio"],
    priority: 40,
  }),
  rule({
    id: "checklist_update",
    family: "workshop_catalogs",
    action: "update",
    methods: ["PUT", "PATCH"],
    path: "^/api/workshop/checklist-templates/[^/]+$",
    anyOf: ["access_checklists_patio"],
    priority: 40,
  }),
  rule({
    id: "checklist_delete",
    family: "workshop_catalogs",
    action: "delete",
    methods: ["DELETE"],
    path: "^/api/workshop/checklist-templates/[^/]+$",
    anyOf: ["access_checklists_patio"],
    priority: 40,
  }),

  ...crud("tv_admin", "tv_goal", "^/api/tv/weekly-goal$", ["access_tv_patio"], 40),
  ...crud("tv_admin", "tv_video", "^/api/tv/video-settings$", ["access_tv_patio"], 40),
  ...crud("tv_admin", "tv_chime", "^/api/tv/chime-schedule$", ["access_tv_patio"], 40),
  ...crud("tv_admin", "tv_slides", "^/api/tv/slides$", ["access_tv_patio"], 40),
  ...crud("tv_admin", "tv_slide", "^/api/tv/slides/[^/]+$", ["access_tv_patio"], 40),
  ...crud("tv_admin", "tv_media", "^/api/tv/media$", ["access_tv_patio"], 40),
  ...crud("tv_admin", "tv_media_item", "^/api/tv/media/.+$", ["access_tv_patio"], 30),
  rule({
    id: "tv_manage_read",
    family: "tv_admin",
    action: "read",
    methods: ["GET"],
    path: "^/api/tv/manage$",
    anyOf: ["access_tv_patio"],
    priority: 40,
  }),

  ...crud("bulletins", "bulletins", "^/api/error-bulletins$", ["access_boletim_erros"], 40),
  ...crud("bulletins", "bulletin", "^/api/error-bulletins/.+$", ["access_boletim_erros"], 30),

  ...crud("reports", "reports", "^/api/reports(?:/.*)?$", ["access_relatorios"], 40),

  rule({
    id: "notifications_purge",
    family: "notifications",
    action: "delete",
    methods: ["DELETE"],
    path: "^/api/notifications$",
    anyOf: [],
    priority: 80,
  }),
];

export const PRODUCTION_AUTHORIZATION_POLICY: AuthorizationPolicy = {
  families: FAMILIES,
  rules: RULES,
};

export function productionAuthorizationPolicy(): AuthorizationPolicy {
  return PRODUCTION_AUTHORIZATION_POLICY;
}
