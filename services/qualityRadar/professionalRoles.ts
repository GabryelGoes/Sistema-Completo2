/**
 * Catálogo de funções profissionais e setores.
 * Função ≠ permissão. Alterar função NÃO muda privilégios sem confirmação.
 */

export const PROFESSIONAL_ROLE_CODES = [
  "diretor",
  "gerente",
  "lider_patio",
  "lider_laboratorio",
  "mecanico",
  "tecnico_eletronico",
  "auxiliar_mecanico",
  "recepcionista",
  "administrativo",
  "financeiro",
  "outros",
] as const;

export type ProfessionalRoleCode = (typeof PROFESSIONAL_ROLE_CODES)[number];

export const PROFESSIONAL_ROLE_LABELS: Record<ProfessionalRoleCode, string> = {
  diretor: "Diretor",
  gerente: "Gerente",
  lider_patio: "Líder de pátio",
  lider_laboratorio: "Líder de laboratório",
  mecanico: "Mecânico",
  tecnico_eletronico: "Técnico eletrônico",
  auxiliar_mecanico: "Auxiliar de mecânico",
  recepcionista: "Recepcionista",
  administrativo: "Administrativo",
  financeiro: "Financeiro",
  outros: "Outros",
};

export const SECTOR_CODES = ["patio", "laboratorio", "administrativo", "outro"] as const;
export type SectorCode = (typeof SECTOR_CODES)[number];

export const SECTOR_LABELS: Record<SectorCode, string> = {
  patio: "Pátio",
  laboratorio: "Laboratório",
  administrativo: "Administrativo",
  outro: "Outro",
};

export function isProfessionalRoleCode(v: unknown): v is ProfessionalRoleCode {
  return typeof v === "string" && (PROFESSIONAL_ROLE_CODES as readonly string[]).includes(v);
}

export function isSectorCode(v: unknown): v is SectorCode {
  return typeof v === "string" && (SECTOR_CODES as readonly string[]).includes(v);
}

/** Perfis sugeridos — NUNCA aplicados sem confirmação explícita do admin. */
export type SuggestedPermissionProfile = {
  id: string;
  label: string;
  description: string;
  forRoles: ProfessionalRoleCode[];
  permissions: Record<string, boolean>;
};

export const SUGGESTED_PERMISSION_PROFILES: SuggestedPermissionProfile[] = [
  {
    id: "mecanico_operacional",
    label: "Mecânico / técnico operacional",
    description: "Home, Pátio ou Lab conforme setor; sem Radar confidencial nem administração.",
    forRoles: ["mecanico", "tecnico_eletronico", "auxiliar_mecanico"],
    permissions: {
      full_access: false,
      access_home: true,
      access_patio: true,
      access_laboratorio: false,
      access_radar_qualidade: false,
      access_settings: false,
      access_change_passwords: false,
      access_technicians: false,
    },
  },
  {
    id: "lider_patio",
    label: "Líder de pátio",
    description: "Pátio + Radar de Qualidade; sem full_access automático.",
    forRoles: ["lider_patio"],
    permissions: {
      full_access: false,
      access_home: true,
      access_patio: true,
      access_orcamentos: true,
      access_radar_qualidade: true,
      access_relatorios: true,
      access_settings: false,
      access_change_passwords: false,
    },
  },
  {
    id: "lider_lab",
    label: "Líder de laboratório",
    description: "Laboratório + Radar; sem full_access.",
    forRoles: ["lider_laboratorio"],
    permissions: {
      full_access: false,
      access_home: true,
      access_laboratorio: true,
      access_radar_qualidade: true,
      access_relatorios: true,
      access_settings: false,
    },
  },
  {
    id: "gerente",
    label: "Gerente (sem admin total)",
    description: "Acompanhamento amplo; NÃO é administrador. full_access continua desligado.",
    forRoles: ["gerente"],
    permissions: {
      full_access: false,
      access_home: true,
      access_patio: true,
      access_laboratorio: true,
      access_orcamentos: true,
      access_radar_qualidade: true,
      access_relatorios: true,
      access_estoque_pecas: true,
      access_settings: false,
      access_change_passwords: false,
      access_technicians: true,
    },
  },
  {
    id: "recepcao",
    label: "Recepcionista",
    description: "Recepção e agenda; sem Radar confidencial.",
    forRoles: ["recepcionista"],
    permissions: {
      full_access: false,
      access_home: true,
      access_reception: true,
      access_agenda: true,
      access_radar_qualidade: false,
      access_settings: false,
    },
  },
];

export function suggestedProfileForRole(
  role: ProfessionalRoleCode | ""
): SuggestedPermissionProfile | null {
  if (!role) return null;
  return SUGGESTED_PERMISSION_PROFILES.find((p) => p.forRoles.includes(role)) || null;
}
