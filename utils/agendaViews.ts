import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Appointment } from '../types';

export type AgendaViewMode = 'month' | 'week' | 'day' | 'schedule';

export const AGENDA_VIEW_STORAGE_KEY = 'rda_agenda_view_v1';

export const AGENDA_VIEW_MODES: {
  id: AgendaViewMode;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  { id: 'month', label: 'Mês', shortLabel: 'Mês', description: 'Grade mensal com visão geral dos agendamentos' },
  { id: 'week', label: 'Semana', shortLabel: 'Sem.', description: 'Colunas por dia com faixas horárias' },
  { id: 'day', label: 'Dia', shortLabel: 'Dia', description: 'Um dia com grade horária detalhada' },
  { id: 'schedule', label: 'Agenda', shortLabel: 'Lista', description: 'Lista cronológica dos próximos agendamentos' },
];

export const AGENDA_HOUR_START = 7;
export const AGENDA_HOUR_END = 19;
export const AGENDA_SLOT_HEIGHT_PX = 52;
export const AGENDA_DEFAULT_DURATION_MIN = 60;

export function readStoredAgendaView(): AgendaViewMode {
  try {
    const v = localStorage.getItem(AGENDA_VIEW_STORAGE_KEY);
    if (AGENDA_VIEW_MODES.some((m) => m.id === v)) return v as AgendaViewMode;
  } catch {
    /* ignore */
  }
  return 'month';
}

export function storeAgendaView(mode: AgendaViewMode): void {
  try {
    localStorage.setItem(AGENDA_VIEW_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function parseAppointmentTime(time: string): { hours: number; minutes: number; totalMinutes: number } {
  const [hRaw, mRaw] = time.split(':');
  const hours = Number.parseInt(hRaw ?? '9', 10) || 9;
  const minutes = Number.parseInt(mRaw ?? '0', 10) || 0;
  return { hours, minutes, totalMinutes: hours * 60 + minutes };
}

export function appointmentDateTime(app: Appointment): Date {
  const d = app.date instanceof Date ? new Date(app.date) : new Date(app.date);
  const { hours, minutes } = parseAppointmentTime(app.time);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function appointmentsForDay(appointments: Appointment[], day: Date): Appointment[] {
  return appointments
    .filter((app) => isSameDay(app.date, day))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function appointmentsInRange(appointments: Appointment[], start: Date, end: Date): Appointment[] {
  const startMs = startOfDay(start).getTime();
  const endMs = endOfDay(end).getTime();
  return appointments
    .filter((app) => {
      const t = startOfDay(app.date instanceof Date ? app.date : new Date(app.date)).getTime();
      return t >= startMs && t <= endMs;
    })
    .sort((a, b) => {
      const da = appointmentDateTime(a).getTime();
      const db = appointmentDateTime(b).getTime();
      return da - db;
    });
}

export function getVisibleRange(mode: AgendaViewMode, anchor: Date): { start: Date; end: Date } {
  switch (mode) {
    case 'month':
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case 'week':
      return {
        start: startOfWeek(anchor, { locale: ptBR }),
        end: endOfWeek(anchor, { locale: ptBR }),
      };
    case 'day':
      return { start: startOfDay(anchor), end: endOfDay(anchor) };
    case 'schedule': {
      const start = startOfWeek(anchor, { locale: ptBR });
      const end = endOfWeek(addWeeks(anchor, 3), { locale: ptBR });
      return { start, end };
    }
    default:
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  }
}

export function formatAgendaPeriodLabel(mode: AgendaViewMode, anchor: Date): string {
  switch (mode) {
    case 'month':
      return format(anchor, 'MMMM yyyy', { locale: ptBR });
    case 'week': {
      const start = startOfWeek(anchor, { locale: ptBR });
      const end = endOfWeek(anchor, { locale: ptBR });
      if (isSameMonth(start, end)) {
        return `${format(start, 'd', { locale: ptBR })} – ${format(end, "d 'de' MMMM yyyy", { locale: ptBR })}`;
      }
      return `${format(start, "d MMM", { locale: ptBR })} – ${format(end, "d MMM yyyy", { locale: ptBR })}`;
    }
    case 'day':
      return format(anchor, "EEEE, d 'de' MMMM yyyy", { locale: ptBR });
    case 'schedule': {
      const { start, end } = getVisibleRange('schedule', anchor);
      return `${format(start, 'd MMM', { locale: ptBR })} – ${format(end, "d MMM yyyy", { locale: ptBR })}`;
    }
    default:
      return format(anchor, 'MMMM yyyy', { locale: ptBR });
  }
}

export function navigatePeriod(mode: AgendaViewMode, anchor: Date, direction: 1 | -1): Date {
  const delta = direction === 1 ? 1 : -1;
  switch (mode) {
    case 'month':
      return delta === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1);
    case 'week':
      return delta === 1 ? addWeeks(anchor, 1) : subWeeks(anchor, 1);
    case 'day':
      return delta === 1 ? addDays(anchor, 1) : subDays(anchor, 1);
    case 'schedule':
      return delta === 1 ? addWeeks(anchor, 1) : subWeeks(anchor, 1);
    default:
      return anchor;
  }
}

export function timeGridTopPx(time: string): number {
  const { totalMinutes } = parseAppointmentTime(time);
  const startMinutes = AGENDA_HOUR_START * 60;
  const offset = totalMinutes - startMinutes;
  return Math.max(0, (offset / 60) * AGENDA_SLOT_HEIGHT_PX);
}

export function timeGridHeightPx(durationMin = AGENDA_DEFAULT_DURATION_MIN): number {
  return Math.max(AGENDA_SLOT_HEIGHT_PX * 0.65, (durationMin / 60) * AGENDA_SLOT_HEIGHT_PX);
}

export function agendaHours(): number[] {
  const hours: number[] = [];
  for (let h = AGENDA_HOUR_START; h <= AGENDA_HOUR_END; h++) hours.push(h);
  return hours;
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { locale: ptBR });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function groupAppointmentsByDay(
  appointments: Appointment[],
  days: Date[]
): Map<string, Appointment[]> {
  const map = new Map<string, Appointment[]>();
  for (const day of days) {
    map.set(day.toISOString(), appointmentsForDay(appointments, day));
  }
  return map;
}

export function scheduleGroupsByDay(appointments: Appointment[]): { day: Date; items: Appointment[] }[] {
  const groups = new Map<string, { day: Date; items: Appointment[] }>();
  for (const app of appointments) {
    const day = startOfDay(app.date instanceof Date ? app.date : new Date(app.date));
    const key = day.toISOString();
    const g = groups.get(key) ?? { day, items: [] };
    g.items.push(app);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.day.getTime() - b.day.getTime());
}
