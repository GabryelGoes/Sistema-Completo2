/**
 * Regras de propriedade no caminho idempotente das RPCs de sessão.
 * Espelha a guarda em 20261101260000_rda_rpc_idempotent_owner_guard.sql.
 */

export function mutationBelongsToTechnician(input: {
  sessionTechnicianUserId: string | null | undefined;
  actorTechnicianUserId: string;
}): boolean {
  if (!input.sessionTechnicianUserId) return false;
  return input.sessionTechnicianUserId === input.actorTechnicianUserId;
}

export function shouldRejectCrossTechnicianIdempotentReplay(input: {
  foundByMutation: boolean;
  sessionTechnicianUserId: string | null | undefined;
  actorTechnicianUserId: string;
}): boolean {
  if (!input.foundByMutation) return false;
  return !mutationBelongsToTechnician({
    sessionTechnicianUserId: input.sessionTechnicianUserId,
    actorTechnicianUserId: input.actorTechnicianUserId,
  });
}
