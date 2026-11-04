/**
 * Identidade estável no Radar — não unifica pessoas só por nome.
 * Unificação exige vínculo confirmado (link) ou aprovação de proposta.
 */

import { normalizeQualityRadarPersonKey } from "../../utils/qualityRadarNormalize.js";

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
};

export function buildUnifiedPeople(input: {
  workshopTechnicians: Array<{ id: string; name: string }>;
  systemUsers: Array<{
    id: string;
    display_name?: string | null;
    username?: string | null;
    job_title?: string | null;
  }>;
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
    const suName =
      (su?.display_name || "").trim() || (su?.username || "").trim() || "";
    const name = (wt?.name || "").trim() || suName || "Funcionário";
    people.push({
      id: `link:${link.workshopTechnicianId}:${link.systemUserId}`,
      name,
      workshopTechnicianId: link.workshopTechnicianId,
      systemUserId: link.systemUserId,
      jobTitle: (su?.job_title || "").trim() || null,
      source: "linked",
      possibleDuplicateIds: [],
    });
    usedWt.add(link.workshopTechnicianId);
    usedSu.add(link.systemUserId);
  }

  for (const t of input.workshopTechnicians) {
    if (usedWt.has(t.id) || linkByWt.has(t.id)) continue;
    const name = (t.name || "").trim();
    if (!name) continue;
    people.push({
      id: `wt:${t.id}`,
      name,
      workshopTechnicianId: t.id,
      systemUserId: null,
      jobTitle: null,
      source: "workshop_technician",
      possibleDuplicateIds: [],
    });
  }

  for (const u of input.systemUsers) {
    if (usedSu.has(u.id) || linkBySu.has(u.id)) continue;
    const name = (u.display_name || "").trim() || (u.username || "").trim();
    if (!name) continue;
    people.push({
      id: `su:${u.id}`,
      name,
      workshopTechnicianId: null,
      systemUserId: u.id,
      jobTitle: (u.job_title || "").trim() || null,
      source: "system_user",
      possibleDuplicateIds: [],
    });
  }

  // Marca possíveis duplicatas por nome — NÃO une automaticamente.
  const byName = new Map<string, string[]>();
  for (const p of people) {
    const key = normalizeQualityRadarPersonKey(p.name);
    if (!key) continue;
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
