import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Shield, X } from "lucide-react";
import {
  iosModalClose,
  iosModalInsetCard,
  iosModalShell,
  resolveIosModalOverlayClass,
} from "./ui/iosModalStyles";
import { ModalPortal } from "./ui/ModalPortal";
import { IosModalHeader } from "./ui/IosModalHeader";
import { useRegisterModalOpen } from "./ui/ModalLayerContext";
import { useDesktopShellLayout } from "./ui/DesktopShellContext";
import { ajustesPcOpsClass } from "./ajustes/AjustesPcLayoutContext";
import { AjustesPcOpsEyebrow } from "./ajustes/AjustesPcOpsEyebrow";
import { ConnectedDevicesModal } from "./ConnectedDevicesModal";
import {
  getSecurityEvents,
  getSecurityEventsSummary,
  getSystemUsersDirectory,
  type SecurityEventRecord,
  type SecurityEventsSummary,
} from "../services/apiService";
import { formatApiFailureMessage } from "../utils/apiHttpError";
import {
  ALERT_EVENT_TYPES,
  AUDIT_EVENT_TYPES,
  OVERVIEW_CRITICAL_TYPES,
  SECURITY_CENTER_EVENT_TYPES,
  SECURITY_CENTER_TIME_ZONE,
  actorLabel,
  countEventTypes,
  eventDetail,
  isCriticalSecurityEvent,
  matchesEventGroup,
  securityEventLabel,
  securityOriginLabel,
  securityOutcomeLabel,
  securityPeriodBounds,
  shortReference,
  type SecurityPeriodPreset,
} from "../utils/securityCenterView";

type Area = "overview" | "history" | "sessions" | "audit" | "alerts";

const AREAS: { id: Area; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "history", label: "Histórico" },
  { id: "sessions", label: "Sessões" },
  { id: "audit", label: "Auditoria" },
  { id: "alerts", label: "Alertas" },
];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    timeZone: SECURITY_CENTER_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EventRow({
  event,
  names,
}: {
  event: SecurityEventRecord;
  names: ReadonlyMap<string, string> | null;
}) {
  const critical = isCriticalSecurityEvent(event.eventType);
  const origin = securityOriginLabel(event.origin);
  const reference = shortReference(event.clientRef);
  const detail = eventDetail(event, names);
  return (
    <li className={`${iosModalInsetCard} px-3.5 py-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">{securityEventLabel(event.eventType)}</p>
        <time className="text-[12px] text-zinc-500 dark:text-zinc-400" dateTime={event.occurredAt}>
          {formatWhen(event.occurredAt)}
        </time>
      </div>
      <p className="mt-1 text-[12px] text-zinc-600 dark:text-zinc-300">
        {actorLabel(event, names)} · {securityOutcomeLabel(event.outcome)}
        {critical ? " · Crítico" : ""}
      </p>
      {detail ? <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">{detail}</p> : null}
      <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
        {event.deviceId ? `Aparelho ${shortReference(event.deviceId)}` : "Aparelho não informado"}
        {origin ? ` · ${origin}` : ""}
        {reference ? ` · Referência ${reference}` : ""}
      </p>
    </li>
  );
}

export function SecurityCenterModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useRegisterModalOpen(isOpen);
  const isDesktopShell = useDesktopShellLayout();
  const [area, setArea] = useState<Area>("overview");
  const [preset, setPreset] = useState<SecurityPeriodPreset>("24h");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [eventType, setEventType] = useState("");
  const [outcome, setOutcome] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [names, setNames] = useState<Map<string, string> | null>(null);
  const [directory, setDirectory] = useState<Array<{ id: string; label: string }>>([]);
  const [summary, setSummary] = useState<SecurityEventsSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [events, setEvents] = useState<SecurityEventRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);

  const bounds = useMemo(
    () => securityPeriodBounds(preset, customFrom, customTo, Date.now()),
    [preset, customFrom, customTo]
  );
  const group = area === "audit" ? AUDIT_EVENT_TYPES : area === "alerts" ? ALERT_EVENT_TYPES : null;

  const loadDirectory = useCallback(async () => {
    try {
      const rows = await getSystemUsersDirectory();
      const map = new Map<string, string>();
      const options: Array<{ id: string; label: string }> = [];
      for (const row of rows) {
        const label = row.display_name?.trim() || row.username;
        map.set(row.id, label);
        options.push({ id: row.id, label });
      }
      setNames(map);
      setDirectory(options);
    } catch {
      setNames(null);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    if (bounds.ok === false) {
      setSummary(null);
      setSummaryError(bounds.error);
      return;
    }
    setSummary(null);
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await getSecurityEventsSummary({ from: bounds.from, to: bounds.to });
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setSummaryError(formatApiFailureMessage(err, "Não foi possível carregar o resumo."));
    } finally {
      setSummaryLoading(false);
    }
  }, [bounds]);

  const loadEvents = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (bounds.ok === false) {
        setEvents([]);
        setNextCursor(null);
        setEventsError(bounds.error);
        return;
      }
      if (!append) {
        setEvents([]);
        setNextCursor(null);
      }
      setEventsLoading(true);
      setEventsError(null);
      try {
        const query = {
          from: bounds.from,
          to: bounds.to,
          eventType: area === "overview" ? undefined : eventType || undefined,
          outcome: area === "overview" ? undefined : outcome || undefined,
          actorUserId: area === "overview" ? undefined : actorUserId || undefined,
        };
        if (group && !query.eventType) {
          const collected: SecurityEventRecord[] = [];
          let pageCursor = cursor;
          let follow: string | null = null;
          for (let step = 0; step < 20 && collected.length < 40; step += 1) {
            const page = await getSecurityEvents({ ...query, limit: 100, cursor: pageCursor });
            collected.push(...page.events.filter((event) => matchesEventGroup(event.eventType, group)));
            follow = page.nextCursor;
            if (!page.nextCursor) break;
            pageCursor = page.nextCursor;
          }
          setEvents((current) => (append ? [...current, ...collected] : collected));
          setNextCursor(follow);
          return;
        }
        const page = await getSecurityEvents({
          ...query,
          limit: area === "overview" ? 8 : 50,
          cursor,
        });
        setEvents((current) => (append ? [...current, ...page.events] : page.events));
        setNextCursor(page.nextCursor);
      } catch (err) {
        if (!append) setEvents([]);
        setNextCursor(null);
        setEventsError(formatApiFailureMessage(err, "Não foi possível carregar os eventos."));
      } finally {
        setEventsLoading(false);
      }
    },
    [actorUserId, area, bounds, eventType, group, outcome]
  );

  useEffect(() => {
    if (!isOpen) return;
    setArea("overview");
    setPreset("24h");
    setEventType("");
    setOutcome("");
    setActorUserId("");
    void loadDirectory();
  }, [isOpen, loadDirectory]);

  useEffect(() => {
    if (!isOpen || area === "sessions") return;
    void loadSummary();
    void loadEvents(null, false);
  }, [isOpen, area, loadSummary, loadEvents]);

  const visibleEvents = events.filter((event) => matchesEventGroup(event.eventType, eventType ? null : group));

  if (!isOpen) return null;

  const metrics = summary
    ? [
        { label: "Logins autorizados", ...countEventTypes(summary, ["login_succeeded"]) },
        { label: "Logins recusados", ...countEventTypes(summary, ["login_denied"]) },
        { label: "Limite de tentativas", ...countEventTypes(summary, ["rate_limited"]) },
        { label: "Eventos críticos", ...countEventTypes(summary, OVERVIEW_CRITICAL_TYPES) },
      ]
    : [];

  return (
    <ModalPortal>
      <div className={resolveIosModalOverlayClass(isDesktopShell)}>
        <div className={`${iosModalShell} ${ajustesPcOpsClass(isDesktopShell)} max-h-[94vh] max-w-3xl`}>
          <button type="button" onClick={onClose} className={`${iosModalClose} z-50`} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className={`shrink-0 px-5 pb-3 pt-8 pr-14 sm:px-8 ${isDesktopShell ? "ajustes-pc-ops-header" : ""}`}>
              <AjustesPcOpsEyebrow desktop={isDesktopShell}>Ajustes · Segurança e acessos</AjustesPcOpsEyebrow>
              <IosModalHeader
                icon={<Shield className="h-[55%] w-[55%]" strokeWidth={2} />}
                title="Central de Segurança"
                subtitle="Eventos reais da oficina"
              />
              <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
                {AREAS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setArea(item.id);
                      setEventType("");
                      setOutcome("");
                      setActorUserId("");
                    }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                      area === item.id
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]"
                    }`}
                    aria-pressed={area === item.id}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={`min-h-0 flex-1 overflow-y-auto px-5 pb-8 sm:px-8 ${isDesktopShell ? "ajustes-pc-ops-scroll" : ""}`}>
              {area === "sessions" ? (
                <div>
                  <p className="mb-3 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    A mesma gestão de sessões e aparelhos. Deslogar e bloquear pedem confirmação.
                  </p>
                  <ConnectedDevicesModal isOpen embedded onClose={onClose} />
                </div>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {(["24h", "7d", "30d", "custom"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPreset(item)}
                        className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                          preset === item
                            ? "bg-zinc-200 text-zinc-900 dark:bg-white/15 dark:text-white"
                            : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        {item === "24h" ? "24 horas" : item === "7d" ? "7 dias" : item === "30d" ? "30 dias" : "Personalizado"}
                      </button>
                    ))}
                    {preset === "custom" ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="date"
                          value={customFrom}
                          onChange={(event) => setCustomFrom(event.target.value)}
                          className="rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-[12px] dark:border-white/10"
                          aria-label="Início do período"
                        />
                        <input
                          type="date"
                          value={customTo}
                          onChange={(event) => setCustomTo(event.target.value)}
                          className="rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-[12px] dark:border-white/10"
                          aria-label="Fim do período"
                        />
                      </div>
                    ) : null}
                  </div>

                  {area !== "overview" ? (
                    <div className="mb-4 grid gap-2 sm:grid-cols-3">
                      <select
                        value={eventType}
                        onChange={(event) => setEventType(event.target.value)}
                        className="rounded-xl border border-zinc-200 bg-transparent px-2 py-2 text-[13px] dark:border-white/10"
                        aria-label="Tipo de evento"
                      >
                        <option value="">Todos os tipos</option>
                        {(group || SECURITY_CENTER_EVENT_TYPES).map((type) => (
                          <option key={type} value={type}>
                            {securityEventLabel(type)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={outcome}
                        onChange={(event) => setOutcome(event.target.value)}
                        className="rounded-xl border border-zinc-200 bg-transparent px-2 py-2 text-[13px] dark:border-white/10"
                        aria-label="Resultado"
                      >
                        <option value="">Todos os resultados</option>
                        <option value="success">Concluído</option>
                        <option value="denied">Recusado</option>
                        <option value="error">Falha</option>
                      </select>
                      <select
                        value={actorUserId}
                        onChange={(event) => setActorUserId(event.target.value)}
                        className="rounded-xl border border-zinc-200 bg-transparent px-2 py-2 text-[13px] dark:border-white/10"
                        aria-label="Funcionário"
                      >
                        <option value="">Todos os funcionários</option>
                        {directory.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {area === "overview" ? (
                    summaryLoading && !summary ? (
                      <p className="flex items-center gap-2 py-8 text-[13px] text-zinc-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando resumo…
                      </p>
                    ) : summaryError ? (
                      <p className="rounded-xl bg-red-50 px-3 py-3 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                        {summaryError}
                      </p>
                    ) : summary ? (
                      <>
                        {summary.truncated ? (
                          <p className="mb-3 text-[12px] leading-relaxed text-zinc-500">
                            O período passou de 2.000 eventos. Os números são parciais, não o total exato.
                          </p>
                        ) : null}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {metrics.map((metric) => (
                            <div key={metric.label} className="min-w-0">
                              <p className="font-display text-[28px] font-semibold leading-none tracking-tight text-zinc-900 dark:text-white">
                                {metric.partial && metric.count === 0
                                  ? "—"
                                  : metric.count}
                              </p>
                              <p className="mt-1 text-[12px] leading-snug text-zinc-500">
                                {metric.partial && metric.count > 0 ? "Pelo menos · " : ""}
                                {metric.label}
                              </p>
                            </div>
                          ))}
                        </div>
                        <h3 className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                          Atividades recentes
                        </h3>
                      </>
                    ) : null
                  ) : null}

                  {area === "alerts" ? (
                    <p className="mb-3 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Alertas são eventos que o servidor já registrou. Não há detecção automática além disso.
                    </p>
                  ) : null}

                  {eventsError && eventsError !== summaryError ? (
                    <p className="rounded-xl bg-red-50 px-3 py-3 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      {eventsError}
                    </p>
                  ) : eventsLoading && events.length === 0 ? (
                    <p className="flex items-center gap-2 py-8 text-[13px] text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando eventos…
                    </p>
                  ) : visibleEvents.length === 0 ? (
                    <p className={`${iosModalInsetCard} px-4 py-8 text-center text-[13px] text-zinc-500`}>
                      Nenhum evento registrado neste recorte.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {visibleEvents.map((event) => (
                        <EventRow key={event.id} event={event} names={names} />
                      ))}
                    </ul>
                  )}

                  {nextCursor && !eventsError ? (
                    <button
                      type="button"
                      disabled={eventsLoading}
                      onClick={() => void loadEvents(nextCursor, true)}
                      className="mt-4 text-[13px] font-semibold text-zinc-700 dark:text-zinc-200"
                    >
                      {eventsLoading ? "Carregando…" : "Carregar mais antigos"}
                    </button>
                  ) : null}
                  {area !== "overview" ? (
                    <p className="mt-4 text-[11px] text-zinc-400">
                      Funcionário ausente da equipe aparece como removido. A referência da origem não é localização.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
