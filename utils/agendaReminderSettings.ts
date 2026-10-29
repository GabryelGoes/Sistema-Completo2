/** Preferências locais de lembretes da Agenda (hub de Ajustes → Notificações). */

export type AgendaSoonMinutes = 15 | 30 | 60;

export type AgendaReminderSettings = {
  /** Banner no dia anterior aos agendamentos de amanhã. */
  dayBeforeEnabled: boolean;
  /** Horário local (HH:mm) em que o banner “amanhã” dispara. */
  dayBeforeTime: string;
  /** Banner X minutos antes de cada agendamento. */
  soonEnabled: boolean;
  soonMinutes: AgendaSoonMinutes;
  /** Bloco “Próximos amanhã” na home. */
  homeTomorrowBlockEnabled: boolean;
};

export const AGENDA_SOON_MINUTE_OPTIONS: AgendaSoonMinutes[] = [15, 30, 60];

export const DEFAULT_AGENDA_REMINDER_SETTINGS: AgendaReminderSettings = {
  dayBeforeEnabled: true,
  dayBeforeTime: '18:00',
  soonEnabled: true,
  soonMinutes: 30,
  homeTomorrowBlockEnabled: true,
};

const STORAGE_KEY = 'app_agenda_reminder_settings';
const FIRED_KEY = 'app_agenda_reminder_fired';

function isSoonMinutes(v: unknown): v is AgendaSoonMinutes {
  return v === 15 || v === 30 || v === 60;
}

function normalizeTime(raw: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw || '').trim());
  if (!m) return DEFAULT_AGENDA_REMINDER_SETTINGS.dayBeforeTime;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function readAgendaReminderSettings(): AgendaReminderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AGENDA_REMINDER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AgendaReminderSettings>;
    return {
      dayBeforeEnabled:
        typeof parsed.dayBeforeEnabled === 'boolean'
          ? parsed.dayBeforeEnabled
          : DEFAULT_AGENDA_REMINDER_SETTINGS.dayBeforeEnabled,
      dayBeforeTime: normalizeTime(
        typeof parsed.dayBeforeTime === 'string'
          ? parsed.dayBeforeTime
          : DEFAULT_AGENDA_REMINDER_SETTINGS.dayBeforeTime
      ),
      soonEnabled:
        typeof parsed.soonEnabled === 'boolean'
          ? parsed.soonEnabled
          : DEFAULT_AGENDA_REMINDER_SETTINGS.soonEnabled,
      soonMinutes: isSoonMinutes(parsed.soonMinutes)
        ? parsed.soonMinutes
        : DEFAULT_AGENDA_REMINDER_SETTINGS.soonMinutes,
      homeTomorrowBlockEnabled:
        typeof parsed.homeTomorrowBlockEnabled === 'boolean'
          ? parsed.homeTomorrowBlockEnabled
          : DEFAULT_AGENDA_REMINDER_SETTINGS.homeTomorrowBlockEnabled,
    };
  } catch {
    return { ...DEFAULT_AGENDA_REMINDER_SETTINGS };
  }
}

export function writeAgendaReminderSettings(next: AgendaReminderSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function readFiredSet(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string').slice(-400));
  } catch {
    return new Set();
  }
}

function writeFiredSet(set: Set<string>): void {
  localStorage.setItem(FIRED_KEY, JSON.stringify([...set].slice(-400)));
}

export function hasAgendaReminderFired(key: string): boolean {
  return readFiredSet().has(key);
}

export function markAgendaReminderFired(key: string): void {
  const set = readFiredSet();
  set.add(key);
  writeFiredSet(set);
}

/** yyyy-MM-dd no fuso local. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addLocalDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function appointmentLocalDateKey(app: { date: Date | string }): string {
  const d = app.date instanceof Date ? app.date : new Date(app.date);
  if (Number.isNaN(d.getTime())) return '';
  return localDateKey(d);
}

/** Combina data do agendamento + "HH:mm" em Date local. */
export function appointmentDateTime(app: { date: Date | string; time: string }): Date | null {
  const d = app.date instanceof Date ? app.date : new Date(app.date);
  if (Number.isNaN(d.getTime())) return null;
  const [hh, mm] = String(app.time || '09:00').split(':').map((x) => Number(x));
  const out = new Date(d);
  out.setHours(Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0);
  return out;
}
