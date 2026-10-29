import React, { useMemo } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import type { Appointment } from '../../types';
import {
  addLocalDays,
  appointmentLocalDateKey,
  localDateKey,
} from '../../utils/agendaReminderSettings';

function vehicleLabel(app: Appointment): string {
  const brand = (app.vehicleBrand ?? '').trim();
  const model = (app.vehicleModel ?? '').trim();
  return [brand, model].filter(Boolean).join(' ') || model || 'Veículo';
}

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
  const tomorrowApps = useMemo(() => {
    const tomorrowKey = localDateKey(addLocalDays(new Date(), 1));
    return appointments
      .filter((a) => a.status === 'scheduled' && appointmentLocalDateKey(a) === tomorrowKey)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }, [appointments]);

  if (tomorrowApps.length === 0) {
    return (
      <section
        className={`rounded-[22px] border-0 bg-white p-4 shadow-none dark:bg-zinc-900 sm:p-5 ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <CalendarClock className="h-4.5 w-4.5 h-[18px] w-[18px]" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-white">
                Próximos amanhã
              </h2>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                Nenhum veículo agendado para amanhã
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAgenda}
            className="shrink-0 text-[12px] font-semibold text-[#007AFF] dark:text-[#7ab8ff]"
          >
            Agenda
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`rounded-[22px] border-0 bg-white p-4 shadow-none dark:bg-zinc-900 sm:p-5 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
            <CalendarClock className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-white">
              Próximos amanhã
            </h2>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              {tomorrowApps.length} agendamento{tomorrowApps.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenAgenda}
          className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-[#007AFF] dark:text-[#7ab8ff]"
        >
          Ver agenda
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} />
        </button>
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
        {tomorrowApps.slice(0, 6).map((app) => {
          const plate = (app.plate || '').trim().toUpperCase();
          return (
            <li key={app.id}>
              <button
                type="button"
                onClick={() => (onSelectAppointment ? onSelectAppointment(app) : onOpenAgenda())}
                className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-zinc-50/80 dark:hover:bg-white/[0.04]"
              >
                <span className="w-12 shrink-0 text-[13px] font-bold tabular-nums text-red-600 dark:text-red-400">
                  {app.time}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-zinc-900 dark:text-white">
                    {vehicleLabel(app)}
                    {plate ? (
                      <span className="ml-1.5 font-mono text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
                        {plate}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                    {app.customerName || 'Cliente'}
                    {app.title ? ` · ${app.title}` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {tomorrowApps.length > 6 ? (
        <button
          type="button"
          onClick={onOpenAgenda}
          className="mt-2 w-full rounded-xl py-2 text-center text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.04]"
        >
          +{tomorrowApps.length - 6} na agenda
        </button>
      ) : null}
    </section>
  );
};
