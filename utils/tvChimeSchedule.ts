/** Configuração de avisos por horário na TV do pátio (playlist + painel). */

export type TvChimeKind = 'info' | 'lunch' | 'departure' | 'custom';

export type TvChimeSoundPreset = 'chime' | 'bell' | 'digital';

export interface TvChimeAlert {
  id: string;
  label: string;
  /** HH:mm (24h), horário local do aparelho que exibe a TV */
  time: string;
  enabled: boolean;
  playSound: boolean;
  /** 0 = domingo … 6 = sábado. Vazio = todos os dias */
  weekdays: number[];
  kind: TvChimeKind;
  /** Texto na faixa ao disparar */
  message: string;
}

export interface TvChimeScheduleConfig {
  version: 1;
  masterEnabled: boolean;
  alerts: TvChimeAlert[];
  soundVolume: number;
  /** Duração da faixa na tela (segundos) */
  bannerSeconds: number;
  /** Minutos antes do horário para aviso leve (0 = desligado) */
  preNotifyMinutes: number;
  preNotifyPlaySound: boolean;
  /** Não dispara sábado e domingo */
  weekendsQuiet: boolean;
  soundPreset: TvChimeSoundPreset;
}

export const TV_CHIME_CONFIG_VERSION = 1 as const;

export function defaultTvChimeSchedule(): TvChimeScheduleConfig {
  return {
    version: TV_CHIME_CONFIG_VERSION,
    masterEnabled: false,
    soundVolume: 0.55,
    bannerSeconds: 45,
    preNotifyMinutes: 0,
    preNotifyPlaySound: false,
    weekendsQuiet: false,
    soundPreset: 'chime',
    alerts: [
      {
        id: 'preset-lunch',
        label: 'Almoço',
        time: '12:00',
        enabled: true,
        playSound: true,
        weekdays: [1, 2, 3, 4, 5],
        kind: 'lunch',
        message: 'Horário de almoço — bom apetite, equipe!',
      },
      {
        id: 'preset-departure',
        label: 'Saída',
        time: '18:00',
        enabled: true,
        playSound: true,
        weekdays: [1, 2, 3, 4, 5],
        kind: 'departure',
        message: 'Fim do expediente — boa noite e boa viagem!',
      },
    ],
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Lê booleano da primeira chave presente (camelCase ou snake_case no JSONB). */
function readRecordBool(o: Record<string, unknown>, keys: string[], defaultValue: boolean): boolean {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
    const v = o[k];
    if (v === null || v === undefined) continue;
    if (v === true || v === 'true' || v === 1 || v === '1') return true;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
  }
  return defaultValue;
}

/** Mescla JSON salvo com defaults e valida limites. */
export function normalizeTvChimeConfig(raw: unknown): TvChimeScheduleConfig {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return defaultTvChimeSchedule();
    }
  }
  const base = defaultTvChimeSchedule();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
  const o = parsed as Record<string, unknown>;

  const soundPresetRaw = String(
    o.soundPreset ?? o.sound_preset ?? ''
  ).toLowerCase();
  const soundPreset: TvChimeSoundPreset =
    soundPresetRaw === 'bell' || soundPresetRaw === 'digital' ? soundPresetRaw : 'chime';

  let alerts: TvChimeAlert[] = base.alerts;
  if (Array.isArray(o.alerts)) {
    alerts = o.alerts
      .filter((a) => a && typeof a === 'object')
      .map((a) => {
        const r = a as Record<string, unknown>;
        const id =
          typeof r.id === 'string' && r.id.trim()
            ? r.id.trim()
            : typeof globalThis.crypto?.randomUUID === 'function'
              ? globalThis.crypto.randomUUID()
              : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : 'Aviso';
        const time = normalizeTimeHHmm(String(r.time ?? '12:00'));
        const weekdays = Array.isArray(r.weekdays)
          ? r.weekdays.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
          : [];
        const kindRaw = String(r.kind ?? 'custom').toLowerCase();
        const kind: TvChimeKind =
          kindRaw === 'lunch' || kindRaw === 'departure' || kindRaw === 'info' ? kindRaw : 'custom';
        const message =
          typeof r.message === 'string' ? r.message.slice(0, 280) : '';
        return {
          id,
          label,
          time,
          enabled: readRecordBool(r, ['enabled', 'Enabled'], true),
          playSound: readRecordBool(r, ['playSound', 'play_sound'], false),
          weekdays,
          kind,
          message: message || base.alerts.find((x) => x.id === id)?.message || `— ${label}`,
        };
      })
      .slice(0, 24);
  }

  if (alerts.length === 0) alerts = base.alerts;

  return {
    version: TV_CHIME_CONFIG_VERSION,
    masterEnabled: readRecordBool(o, ['masterEnabled', 'master_enabled', 'MasterEnabled'], false),
    alerts,
    soundVolume: clamp(
      Number(
        o.soundVolume ??
          o.sound_volume ??
          base.soundVolume
      ) || base.soundVolume,
      0.05,
      1
    ),
    bannerSeconds: clamp(
      Math.round(
        Number(
          o.bannerSeconds ??
            o.banner_seconds ??
            base.bannerSeconds
        ) || base.bannerSeconds
      ),
      8,
      120
    ),
    preNotifyMinutes: clamp(
      Math.round(Number(o.preNotifyMinutes ?? o.pre_notify_minutes ?? 0)),
      0,
      60
    ),
    preNotifyPlaySound: readRecordBool(
      o,
      ['preNotifyPlaySound', 'pre_notify_play_sound'],
      false
    ),
    weekendsQuiet: readRecordBool(o, ['weekendsQuiet', 'weekends_quiet'], false),
    soundPreset,
  };
}

/** Normaliza "9:5" → "09:05" */
export function normalizeTimeHHmm(raw: string): string {
  const m = String(raw || '').trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return '12:00';
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return '12:00';
  h = clamp(h, 0, 23);
  min = clamp(min, 0, 59);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function parseTimeToMinutes(t: string): number | null {
  const m = normalizeTimeHHmm(t).match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h * 60 + min;
}
