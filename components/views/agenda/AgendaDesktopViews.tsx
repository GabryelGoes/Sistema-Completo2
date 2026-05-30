import React from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Columns3, LayoutList, List } from 'lucide-react';
import type { Appointment } from '../../../types';
import { desktopOnmotorCard } from '../../ui/desktopCardStyles';
import {
  AGENDA_HOUR_END,
  AGENDA_HOUR_START,
  AGENDA_SLOT_HEIGHT_PX,
  AGENDA_VIEW_MODES,
  agendaHours,
  appointmentsForDay,
  appointmentsInRange,
  getVisibleRange,
  groupAppointmentsByDay,
  scheduleGroupsByDay,
  timeGridHeightPx,
  timeGridTopPx,
  type AgendaViewMode,
  weekDays,
} from '../../../utils/agendaViews';

const VIEW_ICONS: Record<AgendaViewMode, React.ReactNode> = {
  month: <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.2} />,
  week: <Columns3 className="h-3.5 w-3.5" strokeWidth={2.2} />,
  day: <LayoutList className="h-3.5 w-3.5" strokeWidth={2.2} />,
  schedule: <List className="h-3.5 w-3.5" strokeWidth={2.2} />,
};

export function AgendaViewSwitcher({
  mode,
  onModeChange,
}: {
  mode: AgendaViewMode;
  onModeChange: (m: AgendaViewMode) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1 rounded-lg border border-zinc-200/90 bg-zinc-100/80 p-0.5 dark:border-white/[0.1] dark:bg-zinc-900/80">
      {AGENDA_VIEW_MODES.map((m) => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onModeChange(m.id)}
            title={m.description}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all ${
              active
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {VIEW_ICONS[m.id]}
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function AppointmentChip({
  app,
  compact,
  onSelect,
}: {
  app: Appointment;
  compact?: boolean;
  onSelect: (app: Appointment) => void;
}) {
  const cancelled = app.status === 'cancelled';
  const done = app.status === 'completed';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(app);
      }}
      className={`w-full text-left rounded-md border-l-[3px] px-2 py-1 transition-colors ${
        cancelled
          ? 'border-zinc-400 bg-zinc-100/90 text-zinc-500 line-through dark:border-zinc-600 dark:bg-white/[0.04] dark:text-zinc-500'
          : done
            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
            : 'border-red-500 bg-red-500/12 text-red-950 hover:bg-red-500/20 dark:text-red-100 dark:hover:bg-red-500/20'
      } ${compact ? 'text-[10px]' : 'text-[11px]'}`}
      title={`${app.time} — ${app.vehicleModel || app.title}`}
    >
      <span className="font-bold tabular-nums">{app.time}</span>
      <span className={`ml-1 ${compact ? 'truncate block' : ''}`}>{app.title || app.vehicleModel}</span>
    </button>
  );
}

function TimeGridBlock({
  app,
  onSelect,
}: {
  app: Appointment;
  onSelect: (app: Appointment) => void;
}) {
  const cancelled = app.status === 'cancelled';
  const done = app.status === 'completed';
  return (
    <button
      type="button"
      onClick={() => onSelect(app)}
      style={{
        top: timeGridTopPx(app.time),
        height: timeGridHeightPx(),
        minHeight: 28,
      }}
      className={`absolute left-0.5 right-0.5 z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-opacity hover:opacity-95 ${
        cancelled
          ? 'border-zinc-400 bg-zinc-200/90 text-zinc-500 line-through dark:bg-zinc-800/80'
          : done
            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-950 dark:text-emerald-100'
            : 'border-red-500 bg-red-500/90 text-white'
      }`}
      title={`${app.time} — ${app.customerName}`}
    >
      <span className="block font-bold tabular-nums">{app.time}</span>
      <span className="block truncate font-semibold">{app.title || app.vehicleModel}</span>
      <span className="block truncate opacity-90">{app.customerName}</span>
    </button>
  );
}

export function AgendaMiniMonth({
  currentDate,
  selectedDate,
  appointments,
  onSelectDay,
  onMonthChange,
}: {
  currentDate: Date;
  selectedDate: Date;
  appointments: Appointment[];
  onSelectDay: (day: Date) => void;
  onMonthChange: (d: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { locale: ptBR });
  const days: Date[] = [];
  let day = gridStart;
  for (let i = 0; i < 42; i++) {
    days.push(day);
    day = addDays(day, 1);
  }

  const countByDay = (d: Date) => appointments.filter((a) => isSameDay(a.date, d)).length;

  return (
    <div className={`${desktopOnmotorCard} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-white/[0.08]">
        <button
          type="button"
          onClick={() => onMonthChange(subMonths(currentDate, 1))}
          className="rounded-md px-2 py-1 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/[0.06]"
        >
          ‹
        </button>
        <span className="text-[13px] font-bold capitalize text-zinc-900 dark:text-white">
          {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(currentDate, 1))}
          className="rounded-md px-2 py-1 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/[0.06]"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-zinc-200/60 p-2 dark:bg-white/[0.06]">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, i) => (
          <div key={`${label}-${i}`} className="text-center text-[10px] font-bold uppercase text-zinc-500">
            {label}
          </div>
        ))}
        {days.map((d) => {
          const inMonth = isSameMonth(d, monthStart);
          const selected = isSameDay(d, selectedDate);
          const today = isToday(d);
          const count = countByDay(d);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelectDay(d)}
              className={`relative flex h-8 flex-col items-center justify-center rounded-md text-[11px] font-semibold transition-colors ${
                !inMonth ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-800 dark:text-zinc-200'
              } ${selected ? 'bg-red-500 text-white' : today ? 'ring-1 ring-red-500/50' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.06]'}`}
            >
              {format(d, 'd')}
              {count > 0 && !selected ? (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-red-500" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaDesktopMonthGrid({
  currentDate,
  selectedDate,
  appointments,
  onSelectDay,
  onNewAppointment,
  onSelectAppointment,
}: {
  currentDate: Date;
  selectedDate: Date;
  appointments: Appointment[];
  onSelectDay: (day: Date) => void;
  onNewAppointment: (day: Date) => void;
  onSelectAppointment: (app: Appointment) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { locale: ptBR });
  const rows: Date[][] = [];
  let row: Date[] = [];
  let day = gridStart;
  for (let i = 0; i < 42; i++) {
    row.push(day);
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
    day = addDays(day, 1);
  }

  const weekHeader = weekDays(currentDate).map((d) => (
    <div
      key={d.toISOString()}
      className="border-b border-zinc-200/80 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:border-white/[0.08]"
    >
      {format(d, 'EEE', { locale: ptBR })}
    </div>
  ));

  return (
    <div className={`${desktopOnmotorCard} flex min-h-0 flex-1 flex-col overflow-hidden`}>
      <div className="grid grid-cols-7 border-b border-zinc-200/80 dark:border-white/[0.08]">{weekHeader}</div>
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7">
        {rows.flat().map((d) => {
          const inMonth = isSameMonth(d, monthStart);
          const selected = isSameDay(d, selectedDate);
          const today = isToday(d);
          const dayApps = appointmentsForDay(appointments, d);
          const visible = dayApps.slice(0, 3);
          const extra = dayApps.length - visible.length;
          return (
            <div
              key={d.toISOString()}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDay(d)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectDay(d);
              }}
              className={`group relative min-h-[5.5rem] border-b border-r border-zinc-200/60 p-1.5 transition-colors dark:border-white/[0.06] ${
                !inMonth ? 'bg-zinc-50/80 dark:bg-zinc-950/40' : 'bg-white dark:bg-zinc-900/50'
              } ${selected ? 'ring-2 ring-inset ring-red-500/50' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.03]'}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${
                    today ? 'bg-red-500 text-white' : 'text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  {format(d, 'd')}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewAppointment(d);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 opacity-0 transition-opacity hover:bg-red-500 hover:text-white group-hover:opacity-100"
                  aria-label="Novo agendamento"
                >
                  +
                </button>
              </div>
              <div className="space-y-0.5">
                {visible.map((app) => (
                  <AppointmentChip key={app.id} app={app} compact onSelect={onSelectAppointment} />
                ))}
                {extra > 0 ? (
                  <p className="px-1 text-[10px] font-semibold text-zinc-500">+{extra} mais</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaTimeGrid({
  mode,
  anchorDate,
  appointments,
  selectedDate,
  onSelectDay,
  onSelectAppointment,
}: {
  mode: 'week' | 'day';
  anchorDate: Date;
  appointments: Appointment[];
  selectedDate: Date;
  onSelectDay: (day: Date) => void;
  onSelectAppointment: (app: Appointment) => void;
}) {
  const days = mode === 'day' ? [startOfDay(anchorDate)] : weekDays(anchorDate);
  const byDay = groupAppointmentsByDay(appointments, days);
  const hours = agendaHours();
  const gridHeight = (AGENDA_HOUR_END - AGENDA_HOUR_START + 1) * AGENDA_SLOT_HEIGHT_PX;

  return (
    <div className={`${desktopOnmotorCard} flex min-h-0 flex-1 flex-col overflow-hidden`}>
      <div
        className="grid shrink-0 border-b border-zinc-200/80 dark:border-white/[0.08]"
        style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div />
        {days.map((d) => {
          const selected = isSameDay(d, selectedDate);
          const today = isToday(d);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelectDay(d)}
              className={`border-l border-zinc-200/60 px-2 py-2 text-center dark:border-white/[0.06] ${
                selected ? 'bg-red-500/10' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.03]'
              }`}
            >
              <p className="text-[10px] font-bold uppercase text-zinc-500">{format(d, 'EEE', { locale: ptBR })}</p>
              <p
                className={`text-[18px] font-bold tabular-nums ${
                  today ? 'text-red-500' : 'text-zinc-900 dark:text-white'
                }`}
              >
                {format(d, 'd')}
              </p>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))`, minHeight: gridHeight }}
        >
          <div className="relative border-r border-zinc-200/60 dark:border-white/[0.06]">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: AGENDA_SLOT_HEIGHT_PX }}
                className="border-b border-zinc-100 pr-1 text-right text-[10px] font-medium tabular-nums text-zinc-400 dark:border-white/[0.04]"
              >
                <span className="-mt-2 inline-block">{`${String(h).padStart(2, '0')}:00`}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayApps = byDay.get(d.toISOString()) ?? [];
            return (
              <div
                key={d.toISOString()}
                className="relative border-l border-zinc-200/60 dark:border-white/[0.06]"
                style={{ height: gridHeight }}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ height: AGENDA_SLOT_HEIGHT_PX }}
                    className="border-b border-zinc-100 dark:border-white/[0.04]"
                  />
                ))}
                {dayApps.map((app) => (
                  <TimeGridBlock key={app.id} app={app} onSelect={onSelectAppointment} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AgendaScheduleList({
  anchorDate,
  appointments,
  onSelectAppointment,
}: {
  anchorDate: Date;
  appointments: Appointment[];
  onSelectAppointment: (app: Appointment) => void;
}) {
  const { start, end } = getVisibleRange('schedule', anchorDate);
  const list = appointmentsInRange(appointments, start, end);
  const groups = scheduleGroupsByDay(list);

  if (groups.length === 0) {
    return (
      <div className={`${desktopOnmotorCard} flex flex-1 flex-col items-center justify-center p-12 text-center`}>
        <p className="text-[15px] font-medium text-zinc-600 dark:text-zinc-400">Nenhum agendamento neste período.</p>
      </div>
    );
  }

  return (
    <div className={`${desktopOnmotorCard} min-h-0 flex-1 overflow-y-auto`}>
      <div className="divide-y divide-zinc-200/80 dark:divide-white/[0.08]">
        {groups.map(({ day, items }) => (
          <div key={day.toISOString()} className="px-4 py-3">
            <p className="mb-2 text-[13px] font-bold capitalize text-zinc-900 dark:text-white">
              {format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
            <div className="space-y-2">
              {items.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => onSelectAppointment(app)}
                  className="flex w-full items-center gap-4 rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 text-left transition-colors hover:border-red-500/30 hover:bg-red-500/5 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-red-500/10"
                >
                  <span className="w-14 shrink-0 text-[14px] font-bold tabular-nums text-red-600 dark:text-red-400">
                    {app.time}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-zinc-900 dark:text-white">
                      {app.title || 'Sem título'}
                    </span>
                    <span className="block truncate text-[12px] text-zinc-600 dark:text-zinc-400">
                      {app.vehicleModel} · {app.customerName}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgendaSidebarDayList({
  selectedDate,
  appointments,
  onSelectAppointment,
  onNewAppointment,
}: {
  selectedDate: Date;
  appointments: Appointment[];
  onSelectAppointment: (app: Appointment) => void;
  onNewAppointment: () => void;
}) {
  const dayApps = appointmentsForDay(appointments, selectedDate);

  return (
    <div className={`${desktopOnmotorCard} flex flex-col overflow-hidden`}>
      <div className="border-b border-zinc-100 px-4 py-3 dark:border-white/[0.08]">
        <p className="text-[13px] font-bold capitalize text-zinc-900 dark:text-white">
          {format(selectedDate, "EEEE, d MMM", { locale: ptBR })}
        </p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {dayApps.length} {dayApps.length === 1 ? 'agendamento' : 'agendamentos'}
        </p>
      </div>
      <div className="max-h-[min(420px,40vh)] overflow-y-auto p-2">
        {dayApps.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-zinc-500">Nenhum agendamento neste dia.</p>
        ) : (
          <div className="space-y-1.5">
            {dayApps.map((app) => (
              <AppointmentChip key={app.id} app={app} onSelect={onSelectAppointment} />
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-zinc-100 p-2 dark:border-white/[0.08]">
        <button
          type="button"
          onClick={onNewAppointment}
          className="w-full rounded-lg bg-red-500 py-2 text-[13px] font-semibold text-white hover:bg-red-600"
        >
          Novo agendamento
        </button>
      </div>
    </div>
  );
}
