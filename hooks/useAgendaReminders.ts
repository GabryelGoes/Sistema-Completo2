import { useEffect, useRef } from 'react';
import type { Appointment } from '../types';
import type { MacOsBudgetBannerItem } from '../components/MacOsBudgetBannerStack';
import {
  appointmentDateTime,
  appointmentLocalDateKey,
  hasAgendaReminderFired,
  localDateKey,
  markAgendaReminderFired,
  nextWorkdayDate,
  nextWorkdayDateKey,
  type AgendaReminderSettings,
} from '../utils/agendaReminderSettings';

function vehicleLabel(app: Appointment): string {
  const brand = (app.vehicleBrand ?? '').trim();
  const model = (app.vehicleModel ?? '').trim();
  return [brand, model].filter(Boolean).join(' ') || model || 'Veículo';
}

function scheduledOnly(list: Appointment[]): Appointment[] {
  return list.filter((a) => a.status === 'scheduled');
}

function parseDayBeforeMinutes(time: string): number {
  const [h, m] = time.split(':').map((x) => Number(x));
  return (Number.isFinite(h) ? h : 18) * 60 + (Number.isFinite(m) ? m : 0);
}

type UseAgendaRemindersOpts = {
  appointments: Appointment[];
  settings: AgendaReminderSettings;
  enabled: boolean;
  pushBanner: (item: MacOsBudgetBannerItem) => void;
  /** Intervalo de checagem (ms). */
  pollMs?: number;
};

/**
 * Dispara banners de agenda: dia anterior (no horário configurado) e X min antes.
 */
export function useAgendaReminders({
  appointments,
  settings,
  enabled,
  pushBanner,
  pollMs = 30_000,
}: UseAgendaRemindersOpts): void {
  const pushRef = useRef(pushBanner);
  pushRef.current = pushBanner;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const appointmentsRef = useRef(appointments);
  appointmentsRef.current = appointments;

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const cfg = settingsRef.current;
      const now = new Date();
      const todayKey = localDateKey(now);
      // Sexta (e fim de semana) → segunda; demais dias → amanhã.
      const upcomingKey = nextWorkdayDateKey(now);
      const upcomingIsMonday = nextWorkdayDate(now).getDay() === 1;
      const list = scheduledOnly(appointmentsRef.current);

      if (cfg.dayBeforeEnabled) {
        const targetMin = parseDayBeforeMinutes(cfg.dayBeforeTime);
        const nowMin = now.getHours() * 60 + now.getMinutes();
        if (nowMin >= targetMin) {
          const upcomingApps = list
            .filter((a) => appointmentLocalDateKey(a) === upcomingKey)
            .sort((a, b) => String(a.time).localeCompare(String(b.time)));
          if (upcomingApps.length > 0) {
            const fireKey = `day_before:${todayKey}:${upcomingKey}`;
            if (!hasAgendaReminderFired(fireKey)) {
              markAgendaReminderFired(fireKey);
              const preview = upcomingApps
                .slice(0, 3)
                .map((a) => {
                  const plate = (a.plate || '').trim().toUpperCase();
                  return `${a.time}${plate ? ` · ${plate}` : ''}`;
                })
                .join(' · ');
              const extra =
                upcomingApps.length > 3 ? ` · +${upcomingApps.length - 3}` : '';
              const whenLabel = upcomingIsMonday ? 'na segunda' : 'amanhã';
              pushRef.current({
                id: `agenda-day-before-${todayKey}-${upcomingKey}`,
                kind: 'agenda_day_before',
                serviceOrderId: upcomingApps[0]?.id || 'agenda',
                appointmentId: upcomingApps[0]?.id,
                vehicleModel: `${upcomingApps.length} veículo${upcomingApps.length === 1 ? '' : 's'} ${whenLabel}`,
                vehiclePlate: null,
                customerName: preview + extra,
                authorName: 'Agenda',
                authorPhotoUrl: null,
              });
            }
          }
        }
      }

      if (cfg.soonEnabled) {
        const mins = cfg.soonMinutes;
        const windowMs = mins * 60_000;
        for (const app of list) {
          const when = appointmentDateTime(app);
          if (!when) continue;
          const delta = when.getTime() - now.getTime();
          // Janela: já passou do “X min antes” e ainda não passou do horário (+2 min de folga).
          if (delta > windowMs || delta < -2 * 60_000) continue;
          const fireKey = `soon:${app.id}:${mins}:${appointmentLocalDateKey(app)}`;
          if (hasAgendaReminderFired(fireKey)) continue;
          markAgendaReminderFired(fireKey);
          const plate = (app.plate || '').trim().toUpperCase() || null;
          pushRef.current({
            id: `agenda-soon-${app.id}-${mins}`,
            kind: 'agenda_soon',
            serviceOrderId: app.id,
            appointmentId: app.id,
            vehicleModel: vehicleLabel(app),
            vehiclePlate: plate,
            customerName: app.customerName || null,
            authorName: 'Agenda',
            authorPhotoUrl: null,
            soonMinutes: mins,
            appointmentTime: app.time,
          });
        }
      }
    };

    tick();
    const id = window.setInterval(tick, pollMs);
    return () => window.clearInterval(id);
  }, [enabled, pollMs]);
}
