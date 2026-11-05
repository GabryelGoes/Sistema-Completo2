/**
 * Identidade estável no Radar — não unifica pessoas só por nome.
 * Unificação exige vínculo confirmado (link) ou aprovação de proposta.
 */

import { normalizeQualityRadarPersonKey } from "../../utils/qualityRadarNormalize.js";
import type { ProfessionalRoleCode, SectorCode } from "./professionalRoles.js";

export type IdentitySourceRow = {
  workshopTechnicianId: string | null;
  systemUserId: string | null;
  name: string;
  jobTitle?: string | null;
};

export type ConfirmedPersonLink = {
  workshopTechnicianId: string;
  systemUserId: string;
};

export type UnifiedPerson = {
  /** Chave estável para UI: link:uuid | wt:uuid | su:uuid */
  id: string;
  name: string;
  workshopTechnicianId: string | null;
  systemUserId: string | null;
  jobTitle: string | null;
  source: "linked" | "workshop_technician" | "system_user";
  /** Nomes normalizados iguais a outro cadastro sem vínculo confirmado. */
  possibleDuplicateIds: string[];
  /** Flags de diagnóstico / filtro */
  hasLogin: boolean;
  hasWorkshopTechnician: boolean;
  isTechnicianFlag: boolean;
  isManagerial: boolean;
  isActive: boolean;
  professionalRole: string;
  sector: string;
  incomplete: boolean;
  incompleteReasons: string[];
};

export type SystemUserIdentityInput = {
  id: string;
  display_name?: string | null;
  username?: string | null;
  full_name?: string | null;
  job_title?: string | null;
  is_technician?: boolean | null;
  is_managerial?: boolean | null;
  is_active?: boolean | null;
  professional_role?: string | null;
  sector?: string | null;
};

export type WorkshopTechnicianIdentityInput = {
  id: string;
  name: string;
  is_active?: boolean | null;
  sector?: string | null;
  professional_role?: string | null;
};

function displayNameFromSu(u: SystemUserIdentityInput): string {
  return (
    (u.full_name || "").trim() ||
    (u.display_name || "").trim() ||
    (u.username || "").trim()
  );
}

function incompleteReasonsFor(p: {
  name: string;
  hasLogin: boolean;
  hasWorkshopTechnician: boolean;
  professionalRole: string;
  sector: string;
  isTechnicianFlag: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!p.name.trim()) reasons.push("nome_vazio");
  if (!p.professionalRole) reasons.push("sem_funcao");
  if (!p.sector) reasons.push("sem_setor");
  if (p.isTechnicianFlag && p.hasLogin && !p.hasWorkshopTechnician) {
    reasons.push("tecnico_sem_cadastro_patio");
  }
  if (p.hasWorkshopTechnician && !p.hasLogin) {
    reasons.push("patio_sem_login");
  }
  return reasons;
}

export function buildUnifiedPeople(input: {
  workshopTechnicians: WorkshopTechnicianIdentityInput[];
  systemUsers: SystemUserIdentityInput[];
  links: ConfirmedPersonLink[];
}): UnifiedPerson[] {
  const linkByWt = new Map(input.links.map((l) => [l.workshopTechnicianId, l]));
  const linkBySu = new Map(input.links.map((l) => [l.systemUserId, l]));
  const usedWt = new Set<string>();
  const usedSu = new Set<string>();
  const people: UnifiedPerson[] = [];

  for (const link of input.links) {
    const wt = input.workshopTechnicians.find((t) => t.id === link.workshopTechnicianId);
    const su = input.systemUsers.find((u) => u.id === link.systemUserId);
    const suName = su ? displayNameFromSu(su) : "";
    const name = (wt?.name || "").trim() || suName || "Funcionário";
    const professionalRole =
      (su?.professional_role || "").trim() || (wt?.professional_role || "").trim() || "";
    const sector = (su?.sector || "").trim() || (wt?.sector || "").trim() || "";
    const isTechnicianFlag = su?.is_technician === true;
    const isActive =
      (su?.is_active !== false) && (wt?.is_active !== false);
    const flags = {
      name,
      hasLogin: !!su,
      hasWorkshopTechnician: !!wt,
      professionalRole,
      sector,
      isTechnicianFlag,
    };
    const reasons = incompleteReasonsFor(flags);
    people.push({
      id: `link:${link.workshopTechnicianId}:${link.systemUserId}`,
      name,
      workshopTechnicianId: link.workshopTechnicianId,
      systemUserId: link.systemUserId,
      jobTitle: (su?.job_title || "").trim() || null,
      source: "linked",
      possibleDuplicateIds: [],
      hasLogin: true,
      hasWorkshopTechnician: true,
      isTechnicianFlag,
      isManagerial: su?.is_managerial === true,
      isActive,
      professionalRole,
      sector,
      incomplete: reasons.length > 0,
      incompleteReasons: reasons,
    });
    usedWt.add(link.workshopTechnicianId);
    usedSu.add(link.systemUserId);
  }

  for (const t of input.workshopTechnicians) {
    if (usedWt.has(t.id) || linkByWt.has(t.id)) continue;
    const name = (t.name || "").trim();
    // Mantém cadastro sem nome na unificação com placeholder — diagnóstico marca incomplete
    const display = name || `(sem nome · wt:${t.id.slice(0, 8)})`;
    const professionalRole = (t.professional_role || "").trim();
    const sector = (t.sector || "").trim() || "patio";
    const flags = {
      name,
      hasLogin: false,
      hasWorkshopTechnician: true,
      professionalRole,
      sector,
      isTechnicianFlag: true,
    };
    const reasons = incompleteReasonsFor(flags);
    if (!name) reasons.unshift("nome_vazio");
    people.push({
      id: `wt:${t.id}`,
      name: display,
      workshopTechnicianId: t.id,
      systemUserId: null,
      jobTitle: null,
      source: "workshop_technician",
      possibleDuplicateIds: [],
      hasLogin: false,
      hasWorkshopTechnician: true,
      isTechnicianFlag: true,
      isManagerial: false,
      isActive: t.is_active !== false,
      professionalRole,
      sector,
      incomplete: reasons.length > 0,
      incompleteReasons: [...new Set(reasons)],
    });
  }

  for (const u of input.systemUsers) {
    if (usedSu.has(u.id) || linkBySu.has(u.id)) continue;
    const name = displayNameFromSu(u);
    const display = name || `(sem nome · su:${u.id.slice(0, 8)})`;
    const professionalRole = (u.professional_role || "").trim();
    const sector = (u.sector || "").trim();
    const isTechnicianFlag = u.is_technician === true;
    const flags = {
      name,
      hasLogin: true,
      hasWorkshopTechnician: false,
      professionalRole,
      sector,
      isTechnicianFlag,
    };
    const reasons = incompleteReasonsFor(flags);
    if (!name) reasons.unshift("nome_vazio");
    people.push({
      id: `su:${u.id}`,
      name: display,
      workshopTechnicianId: null,
      systemUserId: u.id,
      jobTitle: (u.job_title || "").trim() || null,
      source: "system_user",
      possibleDuplicateIds: [],
      hasLogin: true,
      hasWorkshopTechnician: false,
      isTechnicianFlag,
      isManagerial: u.is_managerial === true,
      isActive: u.is_active !== false,
      professionalRole,
      sector,
      incomplete: reasons.length > 0,
      incompleteReasons: [...new Set(reasons)],
    });
  }

  // Marca possíveis duplicatas por nome — NÃO une automaticamente.
  const byName = new Map<string, string[]>();
  for (const p of people) {
    const key = normalizeQualityRadarPersonKey(p.name);
    if (!key || p.name.startsWith("(sem nome")) continue;
    const list = byName.get(key) || [];
    list.push(p.id);
    byName.set(key, list);
  }
  for (const p of people) {
    const key = normalizeQualityRadarPersonKey(p.name);
    const peers = (byName.get(key) || []).filter((id) => id !== p.id);
    p.possibleDuplicateIds = peers;
  }

  return people.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Sugestões de vínculo: mesmo nome normalizado, um WT e um SU, sem link. */
export function suggestPersonLinkPairs(people: UnifiedPerson[]): Array<{
  workshopTechnicianId: string;
  systemUserId: string;
  normalizedName: string;
}> {
  const out: Array<{
    workshopTechnicianId: string;
    systemUserId: string;
    normalizedName: string;
  }> = [];
  const wts = people.filter((p) => p.source === "workshop_technician" && p.workshopTechnicianId);
  const sus = people.filter((p) => p.source === "system_user" && p.systemUserId);
  for (const wt of wts) {
    const key = normalizeQualityRadarPersonKey(wt.name);
    if (!key || wt.name.startsWith("(sem nome")) continue;
    for (const su of sus) {
      if (normalizeQualityRadarPersonKey(su.name) !== key) continue;
      out.push({
        workshopTechnicianId: wt.workshopTechnicianId!,
        systemUserId: su.systemUserId!,
        normalizedName: key,
      });
    }
  }
  return out;
}

export type PeopleDiagnostics = {
  counts: {
    workshopTechnicians: number;
    systemUsers: number;
    systemUsersIsTechnician: number;
    systemUsersInactive: number;
    links: number;
    unifiedPeople: number;
    orphansWtOnly: number;
    orphansSuOnly: number;
    linked: number;
    nameCollisions: number;
    incomplete: number;
    managerial: number;
  };
  queryErrors: {
    technicians: string | null;
    systemUsers: string | null;
    links: string | null;
  };
  dropped: Array<{ reason: string; table: string; id: string; label?: string }>;
  unlinkedSameName: Array<{
    workshopTechnicianId: string;
    systemUserId: string;
    normalizedName: string;
  }>;
  bySource: {
    linked: number;
    workshop_technician: number;
    system_user: number;
  };
  weeklyCycleEligible: {
    wouldInclude: number;
    excludedInactive: string[];
    note: string;
  };
  schemaHints: string[];
};

export function buildPeopleDiagnostics(input: {
  workshopTechnicians: WorkshopTechnicianIdentityInput[];
  systemUsers: SystemUserIdentityInput[];
  links: ConfirmedPersonLink[];
  queryErrors: PeopleDiagnostics["queryErrors"];
  people: UnifiedPerson[];
}): PeopleDiagnostics {
  const suggestions = suggestPersonLinkPairs(input.people);
  const nameCollisionPeople = input.people.filter((p) => p.possibleDuplicateIds.length > 0);
  const eligible = input.people.filter((p) => {
    if (!p.isActive) return false;
    // Elegível ao ciclo: vinculado técnico OU is_technician OU só WT
    return p.hasWorkshopTechnician || p.isTechnicianFlag || p.source === "workshop_technician";
  });
  const excludedInactive = input.people
    .filter((p) => !p.isActive)
    .map((p) => p.name)
    .slice(0, 20);

  const schemaHints: string[] = [];
  if (input.queryErrors.systemUsers && /column.*does not exist|is_active/i.test(input.queryErrors.systemUsers)) {
    schemaHints.push("Coluna is_active/professional_role pode estar pendente (rode migration people_identity).");
  }
  if (input.queryErrors.links && /does not exist|relation/i.test(input.queryErrors.links)) {
    schemaHints.push("Tabela workshop_quality_person_links pendente (Fase 1).");
  }

  return {
    counts: {
      workshopTechnicians: input.workshopTechnicians.length,
      systemUsers: input.systemUsers.length,
      systemUsersIsTechnician: input.systemUsers.filter((u) => u.is_technician === true).length,
      systemUsersInactive: input.systemUsers.filter((u) => u.is_active === false).length,
      links: input.links.length,
      unifiedPeople: input.people.length,
      orphansWtOnly: input.people.filter((p) => p.source === "workshop_technician").length,
      orphansSuOnly: input.people.filter((p) => p.source === "system_user").length,
      linked: input.people.filter((p) => p.source === "linked").length,
      nameCollisions: nameCollisionPeople.length,
      incomplete: input.people.filter((p) => p.incomplete).length,
      managerial: input.people.filter((p) => p.isManagerial).length,
    },
    queryErrors: input.queryErrors,
    dropped: input.people
      .filter((p) => p.incompleteReasons.includes("nome_vazio"))
      .map((p) => ({
        reason: "nome_vazio_ou_placeholder",
        table: p.hasLogin ? "workshop_system_users" : "workshop_technicians",
        id: p.systemUserId || p.workshopTechnicianId || p.id,
        label: p.name,
      })),
    unlinkedSameName: suggestions,
    bySource: {
      linked: input.people.filter((p) => p.source === "linked").length,
      workshop_technician: input.people.filter((p) => p.source === "workshop_technician").length,
      system_user: input.people.filter((p) => p.source === "system_user").length,
    },
    weeklyCycleEligible: {
      wouldInclude: eligible.length,
      excludedInactive,
      note: "Ciclo inclui ativos com cadastro técnico OU is_technician; não usa cargo para ACL.",
    },
    schemaHints,
  };
}

/** Quem entra no ciclo semanal (sem LLM). */
export function peopleEligibleForWeeklyCycle(people: UnifiedPerson[]): UnifiedPerson[] {
  return people.filter((p) => {
    if (!p.isActive) return false;
    return p.hasWorkshopTechnician || p.isTechnicianFlag;
  });
}

export const FAULT_ATTRIBUTIONS = [
  "investigacao",
  "erro_comprovado",
  "fator_externo",
  "nao_aplicavel",
] as const;

export type FaultAttribution = (typeof FAULT_ATTRIBUTIONS)[number];

export function isFaultAttribution(v: unknown): v is FaultAttribution {
  return typeof v === "string" && (FAULT_ATTRIBUTIONS as readonly string[]).includes(v);
}

/** Ocorrência conta como “erro atribuído ao mecânico” só se comprovado. */
export function isProvenMechanicFault(faultAttribution: string | null | undefined): boolean {
  return faultAttribution === "erro_comprovado";
}

export type { ProfessionalRoleCode, SectorCode };
