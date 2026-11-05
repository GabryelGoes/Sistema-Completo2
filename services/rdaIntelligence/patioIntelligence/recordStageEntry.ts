import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordStageEntryInput = {
  supabase: SupabaseClient;
  workshopId: string;
  serviceOrderId: string;
  fromStatus: string | null;
  toStatus: string;
  actorUserId?: string | null;
  source?: string;
  enteredAt?: string;
};

export type RecordStageEntryResult = {
  ok: boolean;
  via: string;
  error?: string;
  /** true quando há evento recente confirmado para to_status. */
  eventConfirmed: boolean;
};

function isSchemaMissing(message: string): boolean {
  return /does not exist|schema cache|status_entered_at|service_order_stage_events/i.test(
    message
  );
}

/**
 * Confirma / completa o registro de entrada na etapa após mudança de status.
 * Idempotente com o trigger (não duplica evento recente).
 * Não engole falha de histórico: se não houver evento confirmado, ok=false.
 */
export async function recordServiceOrderStageEntry(
  input: RecordStageEntryInput
): Promise<RecordStageEntryResult> {
  const enteredAt = input.enteredAt || new Date().toISOString();
  const source = input.source || "api";
  const sinceMs = Date.parse(enteredAt);
  const since = new Date((Number.isFinite(sinceMs) ? sinceMs : Date.now()) - 8000).toISOString();

  try {
    const recentQuery = await input.supabase
      .from("service_order_stage_events")
      .select("id")
      .eq("service_order_id", input.serviceOrderId)
      .eq("to_status", input.toStatus)
      .gte("entered_at", since)
      .limit(1);

    if (recentQuery.error) {
      if (isSchemaMissing(recentQuery.error.message)) {
        return {
          ok: false,
          via: "schema_missing",
          error: recentQuery.error.message,
          eventConfirmed: false,
        };
      }
      return {
        ok: false,
        via: "select_error",
        error: recentQuery.error.message,
        eventConfirmed: false,
      };
    }

    if (recentQuery.data && recentQuery.data.length > 0) {
      // Trigger já registrou — garantir status_entered_at alinhado (idempotente).
      const { error: updErr } = await input.supabase
        .from("service_orders")
        .update({ status_entered_at: enteredAt })
        .eq("id", input.serviceOrderId)
        .eq("workshop_id", input.workshopId);
      if (updErr && !isSchemaMissing(updErr.message)) {
        console.error("[patio-intel] status_entered_at sync após evento:", updErr.message);
      }
      return { ok: true, via: "trigger_or_recent", eventConfirmed: true };
    }

    // Sem evento recente: inserir histórico primeiro; só então marcar entrada.
    const { error: insErr } = await input.supabase.from("service_order_stage_events").insert({
      workshop_id: input.workshopId,
      service_order_id: input.serviceOrderId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      entered_at: enteredAt,
      actor_user_id: input.actorUserId || null,
      source,
      meta: {},
    });

    if (insErr) {
      if (isSchemaMissing(insErr.message)) {
        return {
          ok: false,
          via: "schema_missing",
          error: insErr.message,
          eventConfirmed: false,
        };
      }
      console.error(
        "[patio-intel] falha ao inserir service_order_stage_events:",
        insErr.message
      );
      return {
        ok: false,
        via: "insert_error",
        error: insErr.message,
        eventConfirmed: false,
      };
    }

    const { error: updErr } = await input.supabase
      .from("service_orders")
      .update({ status_entered_at: enteredAt })
      .eq("id", input.serviceOrderId)
      .eq("workshop_id", input.workshopId);

    if (updErr) {
      if (isSchemaMissing(updErr.message)) {
        // Evento existe; coluna pode estar ausente em ambiente parcial — evento confirmado.
        return {
          ok: false,
          via: "schema_missing",
          error: updErr.message,
          eventConfirmed: true,
        };
      }
      console.error(
        "[patio-intel] evento gravado mas status_entered_at falhou:",
        updErr.message
      );
      return {
        ok: false,
        via: "entered_at_update_error",
        error: updErr.message,
        eventConfirmed: true,
      };
    }

    return { ok: true, via: source, eventConfirmed: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[patio-intel] recordServiceOrderStageEntry exception:", msg);
    return { ok: false, via: "exception", error: msg, eventConfirmed: false };
  }
}
