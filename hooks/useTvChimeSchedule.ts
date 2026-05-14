import { useEffect, useRef } from 'react';
import type { TvChimeAlert, TvChimeScheduleConfig } from '../utils/tvChimeSchedule';
import { minutesSinceMidnight, parseTimeToMinutes } from '../utils/tvChimeSchedule';
import { playTvChimePreSound, playTvChimeSound } from '../utils/tvChimeAudio';

export type TvChimeFirePayload = {
  alert: TvChimeAlert;
  phase: 'pre' | 'main';
};

type UseTvChimeScheduleOptions = {
  /** Ex.: modal aberto e dados carregados */
  enabled: boolean;
  config: TvChimeScheduleConfig | null;
  onFire: (payload: TvChimeFirePayload) => void;
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekdayOk(d: Date, weekdays: number[]): boolean {
  if (!weekdays.length) return true;
  return weekdays.includes(d.getDay());
}

/**
 * Compara o relógio local com os horários configurados (a TV usa o relógio do equipamento).
 * Dispara no máximo uma vez por alerta por dia (fase pre/main).
 */
export function useTvChimeSchedule({ enabled, config, onFire }: UseTvChimeScheduleOptions): void {
  const firedRef = useRef<Set<string>>(new Set());
  const dayRef = useRef<string>('');
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;

  useEffect(() => {
    firedRef.current.clear();
    dayRef.current = '';
  }, [config]);

  useEffect(() => {
    if (!enabled || !config?.masterEnabled) return;

    const tick = () => {
      const now = new Date();
      const dk = dayKey(now);
      if (dayRef.current !== dk) {
        dayRef.current = dk;
        firedRef.current.clear();
      }

      if (config.weekendsQuiet) {
        const wd = now.getDay();
        if (wd === 0 || wd === 6) return;
      }

      const nowM = minutesSinceMidnight(now);

      for (const alert of config.alerts) {
        if (!alert.enabled) continue;
        if (!weekdayOk(now, alert.weekdays)) continue;

        const targetM = parseTimeToMinutes(alert.time);
        if (targetM == null) continue;

        const preM = config.preNotifyMinutes > 0 ? targetM - config.preNotifyMinutes : null;

        if (preM != null && preM >= 0 && nowM === preM) {
          const key = `pre-${alert.id}-${dk}`;
          if (!firedRef.current.has(key)) {
            firedRef.current.add(key);
            if (config.preNotifyPlaySound) {
              void playTvChimePreSound(config.soundVolume);
            }
            onFireRef.current({ alert, phase: 'pre' });
          }
        }

        if (nowM === targetM) {
          const key = `main-${alert.id}-${dk}`;
          if (!firedRef.current.has(key)) {
            firedRef.current.add(key);
            if (alert.playSound) {
              void playTvChimeSound(config.soundPreset, config.soundVolume);
            }
            onFireRef.current({ alert, phase: 'main' });
          }
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 8000);
    return () => window.clearInterval(id);
  }, [enabled, config]);
}
