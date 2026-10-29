import React, { useMemo } from 'react';
import { CalendarClock, ChevronRight, Sun } from 'lucide-react';
import type { Appointment } from '../../types';
import {
  appointmentLocalDateKey,
  isUpcomingWorkdayMondayTitle,
  localDateKey,
  nextWorkdayDateKey,
  upcomingWorkdayHomeTitle,
} from '../../utils/agendaReminderSettings';

function vehicleLabel(app: Appointment): string {
  const brand = (app.vehicleBrand ?? '').trim();
  const model = (app.vehicleModel ?? '').trim();
  return [brand, model].filter(Boolean).join(' ') || model || 'Veículo';
}

function sortByTime(list: Appointment[]): Appointment[] {
  return [...list].sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

type AppointmentColumnProps = {
  title: string;
  subtitle: string;
  /** Caixa vazia opcional; omitir para usar só o subtítulo (evita mensagem duplicada). */
  emptyText?: string;
  apps: Appointment[];
  accent: 'red' | 'blue';
  icon: 'clock' | 'sun';
  onOpenAgenda: () => void;
  onSelectAppointment?: (app: Appointment) => void;
  /** Limite de linhas na lista. */
  maxRows?: number;
};

const AppointmentColumn: React.FC<AppointmentColumnProps> = ({
  title,
  subtitle,
  emptyText,
  apps,
  accent,
  icon,
  onOpenAgenda,
  onSelectAppointment,
  maxRows = 5,
}) => {
  const accentWrap =
    accent === 'red'
      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
      : 'bg-[#007AFF]/12 text-[#007AFF] dark:text-[#7ab8ff]';
  const timeClass =
    accent === 'red'
      ? 'text-red-600 dark:text-red-400'
      : 'text-[#007AFF] dark:text-[#7ab8ff]';
  const Icon = icon === 'sun' ? Sun : CalendarClock;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2.5 flex items-start gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accentWrap}`}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-[15px] font-semibold leading-tight text-zinc-900 dark:text-white">
            {title}
          </h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
      </div>

      {apps.length === 0 ? (
        emptyText ? (
          <p className="rounded-xl bg-zinc-50/90 px-3 py-3 text-[12px] text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400">
            {emptyText}
          </p>
        ) : null
      ) : (
        <>
          <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {apps.slice(0, maxRows).map((app) => {
              const plate = (app.plate || '').trim().toUpperCase();
              return (
                <li key={app.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectAppointment ? onSelectAppointment(app) : onOpenAgenda()
                    }
                    className="flex w-full items-center gap-2.5 py-2 text-left transition-colors hover:bg-zinc-50/80 dark:hover:bg-white/[0.04]"
                  >
                    <span
                      className={`w-11 shrink-0 text-[13px] font-bold tabular-nums ${timeClass}`}
                    >
                      {app.time}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-zinc-900 dark:text-white">
                        {vehicleLabel(app)}
                        {plate ? (
                          <span className="ml-1.5 font-mono text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                            {plate}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        {app.customerName || 'Cliente'}
                        {app.title ? ` · ${app.title}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {apps.length > maxRows ? (
            <button
              type="button"
              onClick={onOpenAgenda}
              className="mt-1.5 w-full rounded-xl py-1.5 text-center text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.04]"
            >
              +{apps.length - maxRows} na agenda
            </button>
          ) : null}
        </>
      )}
    </div>
  );
};

type HomeTomorrowAppointmentsCardProps = {
  appointments: Appointment[];
  onOpenAgenda: () => void;
  onSelectAppointment?: (app: Appointment) => void;
  className?: string;
};

export const HomeTomorrowAppointmentsCard: React.FC<HomeTomorrowAppointmentsCardProps> = ({
  appointments,
  onOpenAgenda,
  onSelectAppointment,
  className = '',
}) => {
  const { todayApps, upcomingApps, upcomingTitle, split } = useMemo(() => {
    const now = new Date();
    const todayKey = localDateKey(now);
    const upcomingKey = nextWorkdayDateKey(now);
    const scheduled = appointments.filter((a) => a.status === 'scheduled');
    const today = sortByTime(
      scheduled.filter((a) => appointmentLocalDateKey(a) === todayKey)
    );
    const upcoming = sortByTime(
      scheduled.filter((a) => appointmentLocalDateKey(a) === upcomingKey)
    );
    return {
      todayApps: today,
      upcomingApps: upcoming,
      upcomingTitle: upcomingWorkdayHomeTitle(now),
      split: today.length > 0,
    };
  }, [appointments]);

  const upcomingIsMonday = isUpcomingWorkdayMondayTitle(upcomingTitle);

  const upcomingSubtitle =
    upcomingApps.length === 0
      ? upcomingIsMonday
        ? 'Nenhum veículo para segunda'
        : 'Nenhum veículo no próximo dia útil'
      : `${upcomingApps.length} agendamento${upcomingApps.length === 1 ? '' : 's'}`;

  const todaySubtitle =
    todayApps.length === 0
      ? 'Nenhum veículo para hoje'
      : `${todayApps.length} agendamento${todayApps.length === 1 ? '' : 's'}`;

  return (
    <section
      className={`rounded-[22px] border-0 bg-white p-4 shadow-none dark:bg-zinc-900 sm:p-5 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
          Agendamentos
        </h2>
        <button
          type="button"
          onClick={onOpenAgenda}
          className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-[#007AFF] dark:text-[#7ab8ff]"
        >
          Ver agenda
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} />
        </button>
      </div>

      {split ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-0">
          <div className="min-w-0 sm:pr-4">
            <AppointmentColumn
              title={upcomingTitle}
              subtitle={upcomingSubtitle}
              apps={upcomingApps}
              accent="red"
              icon="clock"
              onOpenAgenda={onOpenAgenda}
              onSelectAppointment={onSelectAppointment}
            />
          </div>
          <div className="min-w-0 border-t border-zinc-100 pt-4 dark:border-white/[0.06] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            <AppointmentColumn
              title="Hoje"
              subtitle={todaySubtitle}
              apps={todayApps}
              accent="blue"
              icon="sun"
              onOpenAgenda={onOpenAgenda}
              onSelectAppointment={onSelectAppointment}
            />
          </div>
        </div>
      ) : (
        <AppointmentColumn
          title={upcomingTitle}
          subtitle={upcomingSubtitle}
          apps={upcomingApps}
          accent="red"
          icon="clock"
          onOpenAgenda={onOpenAgenda}
          onSelectAppointment={onSelectAppointment}
          maxRows={6}
        />
      )}
    </section>
  );
};
