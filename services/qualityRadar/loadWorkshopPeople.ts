/**
 * Carrega fontes de pessoas com erros explícitos (nunca engole falha como lista vazia).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPeopleDiagnostics,
  buildUnifiedPeople,
  peopleEligibleForWeeklyCycle,
  suggestPersonLinkPairs,
  type ConfirmedPersonLink,
  type PeopleDiagnostics,
  type SystemUserIdentityInput,
  type UnifiedPerson,
  type WorkshopTechnicianIdentityInput,
} from "./identity.js";

export type LoadWorkshopPeopleResult = {
  ok: boolean;
  people: UnifiedPerson[];
  suggestions: ReturnType<typeof suggestPersonLinkPairs>;
  links: ConfirmedPersonLink[];
  pendingProposals: Array<Record<string, unknown>>;
  techniciansRaw: WorkshopTechnicianIdentityInput[];
  systemUsersRaw: SystemUserIdentityInput[];
  linksMissing: boolean;
  queryErrors: PeopleDiagnostics["queryErrors"];
  fatalError?: string;
};

const SU_SELECT_FULL =
  "id, display_name, username, full_name, job_title, is_technician, is_managerial, is_active, professional_role, sector";
const SU_SELECT_LEGACY = "id, display_name, username, job_title, is_technician";
const WT_SELECT_FULL = "id, name, is_active, sector, professional_role, sort_order";
const WT_SELECT_LEGACY = "id, name, sort_order";

export async function loadWorkshopPeople(
  supabase: SupabaseClient,
  workshopId: string
): Promise<LoadWorkshopPeopleResult> {
  const queryErrors: PeopleDiagnostics["queryErrors"] = {
    technicians: null,
    systemUsers: null,
    links: null,
  };

  type RowsResult = { data: unknown[] | null; error: { message: string } | null };

  let techsRes: RowsResult = await supabase
    .from("workshop_technicians")
    .select(WT_SELECT_FULL)
    .eq("workshop_id", workshopId)
    .order("sort_order", { ascending: true });

  if (techsRes.error && /column|does not exist/i.test(techsRes.error.message)) {
    techsRes = await supabase
      .from("workshop_technicians")
      .select(WT_SELECT_LEGACY)
      .eq("workshop_id", workshopId)
      .order("sort_order", { ascending: true });
  }
  if (techsRes.error) {
    queryErrors.technicians = techsRes.error.message;
  }

  let usersRes: RowsResult = await supabase
    .from("workshop_system_users")
    .select(SU_SELECT_FULL)
    .eq("workshop_id", workshopId)
    .order("display_name", { ascending: true });

  if (usersRes.error && /column|does not exist/i.test(usersRes.error.message)) {
    usersRes = await supabase
      .from("workshop_system_users")
      .select(SU_SELECT_LEGACY)
      .eq("workshop_id", workshopId)
      .order("display_name", { ascending: true });
  }
  if (usersRes.error) {
    queryErrors.systemUsers = usersRes.error.message;
  }

  // Fatal: ambas as fontes principais falharam
  if (techsRes.error && usersRes.error) {
    return {
      ok: false,
      people: [],
      suggestions: [],
      links: [],
      pendingProposals: [],
      techniciansRaw: [],
      systemUsersRaw: [],
      linksMissing: false,
      queryErrors,
      fatalError: `Falha ao carregar técnicos e usuários: ${techsRes.error.message}; ${usersRes.error.message}`,
    };
  }

  const linksRes = await supabase
    .from("workshop_quality_person_links")
    .select("workshop_technician_id, system_user_id")
    .eq("workshop_id", workshopId);

  const linksMissing =
    !!linksRes.error && /does not exist|relation/i.test(linksRes.error.message);
  if (linksRes.error && !linksMissing) {
    queryErrors.links = linksRes.error.message;
  }

  const proposalsRes = await supabase
    .from("workshop_quality_person_link_proposals")
    .select("*")
    .eq("workshop_id", workshopId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const techniciansRaw: WorkshopTechnicianIdentityInput[] = (techsRes.data || []).map((t) => {
    const row = t as Record<string, unknown>;
    return {
      id: String(row.id),
      name: String(row.name || ""),
      is_active: row.is_active == null ? true : row.is_active === true,
      sector: typeof row.sector === "string" ? row.sector : "patio",
      professional_role: typeof row.professional_role === "string" ? row.professional_role : "",
    };
  });

  const systemUsersRaw: SystemUserIdentityInput[] = (usersRes.data || []).map((u) => {
    const row = u as Record<string, unknown>;
    return {
      id: String(row.id),
      display_name: (row.display_name as string) || null,
      username: (row.username as string) || null,
      full_name: (row.full_name as string) || null,
      job_title: (row.job_title as string) || null,
      is_technician: row.is_technician === true,
      is_managerial: row.is_managerial === true,
      is_active: row.is_active == null ? true : row.is_active === true,
      professional_role: typeof row.professional_role === "string" ? row.professional_role : "",
      sector: typeof row.sector === "string" ? row.sector : "",
    };
  });

  const links: ConfirmedPersonLink[] = linksMissing
    ? []
    : (linksRes.data ?? []).map((r) => ({
        workshopTechnicianId: String(
          (r as { workshop_technician_id: string }).workshop_technician_id
        ),
        systemUserId: String((r as { system_user_id: string }).system_user_id),
      }));

  const people = buildUnifiedPeople({
    workshopTechnicians: techniciansRaw,
    systemUsers: systemUsersRaw,
    links,
  });

  const pendingProposals = proposalsRes.error
    ? []
    : (proposalsRes.data ?? []).map((p) => {
        const row = p as Record<string, unknown>;
        return {
          id: row.id,
          workshopTechnicianId: row.workshop_technician_id,
          systemUserId: row.system_user_id,
          normalizedNameHint: row.normalized_name_hint ?? "",
          status: row.status,
          proposedReason: row.proposed_reason ?? "",
          proposedByName: row.proposed_by_name ?? "",
          createdAt: row.created_at,
        };
      });

  return {
    ok: true,
    people,
    suggestions: suggestPersonLinkPairs(people),
    links,
    pendingProposals,
    techniciansRaw,
    systemUsersRaw,
    linksMissing,
    queryErrors,
  };
}

export function diagnosticsFromLoad(loaded: LoadWorkshopPeopleResult): PeopleDiagnostics {
  return buildPeopleDiagnostics({
    workshopTechnicians: loaded.techniciansRaw,
    systemUsers: loaded.systemUsersRaw,
    links: loaded.links,
    queryErrors: loaded.queryErrors,
    people: loaded.people,
  });
}

export { peopleEligibleForWeeklyCycle };
