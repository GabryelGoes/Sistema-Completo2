/**
 * Encapsula o driver Web Bluetooth NIIMBOT (vendor) para a PWA.
 * Conexão BLE é mantida entre impressões para reimpressão rápida.
 *
 * Modelo/tamanho alinhados a vendor/niimbot-web-bluetooth/registry-b1.json
 * (B1 @ 203 dpi, T50x30_b1 = 384×240, offset_y_px 4).
 */
import '../vendor/niimbot-web-bluetooth/niimbot.js';
import type { NiimbotModel, NiimbotSize } from '../vendor/niimbot-web-bluetooth/niimbot';

export type NiimbotConnectionStatus =
  | 'unsupported'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'printing'
  | 'error';

export type NiimbotServiceSnapshot = {
  status: NiimbotConnectionStatus;
  message: string | null;
  printerLabel: string | null;
};

type Listener = (snap: NiimbotServiceSnapshot) => void;

export const NIIMBOT_B1_MODEL: NiimbotModel = {
  name_prefixes: ['B1'],
  task: 'b1',
  density: 3,
  label_type: 1,
  speed: 1,
};

export const NIIMBOT_T50x30_SIZE: NiimbotSize = {
  w_px: 384,
  h_px: 240,
  offset_y_px: 4,
};

export const NIIMBOT_SIZE_LABEL = '50 × 30 mm (B1)';
export const NIIMBOT_MODEL_LABEL = 'Niimbot B1';

function api() {
  const n = typeof window !== 'undefined' ? window.Niimbot : undefined;
  if (!n) throw new Error('Driver NIIMBOT não carregado.');
  return n;
}

function isBleLinkUp(): boolean {
  try {
    return !!api().printer;
  } catch {
    return false;
  }
}

function apiSafePrinterLabel(): string | null {
  try {
    return api().printer?.label ?? null;
  } catch {
    return null;
  }
}

class NiimbotService {
  private status: NiimbotConnectionStatus = 'disconnected';
  private message: string | null = null;
  private listeners = new Set<Listener>();

  constructor() {
    if (typeof window !== 'undefined' && !this.isSupported()) {
      this.status = 'unsupported';
      this.message =
        'Web Bluetooth indisponível. Use Chrome ou Edge no Android/desktop (HTTPS).';
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): NiimbotServiceSnapshot {
    return {
      status: this.status,
      message: this.message,
      printerLabel: apiSafePrinterLabel(),
    };
  }

  isSupported(): boolean {
    try {
      return (
        typeof navigator !== 'undefined' &&
        !!(navigator as Navigator & { bluetooth?: unknown }).bluetooth &&
        api().isSupported()
      );
    } catch {
      return false;
    }
  }

  isConnected(): boolean {
    return this.status === 'connected' || this.status === 'printing' || isBleLinkUp();
  }

  private setState(status: NiimbotConnectionStatus, message: string | null = null) {
    this.status = status;
    this.message = message;
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  async connect(): Promise<void> {
    if (!this.isSupported()) {
      this.setState(
        'unsupported',
        'Web Bluetooth indisponível. Use Chrome ou Edge no Android/desktop (HTTPS).'
      );
      throw new Error(this.message || 'Web Bluetooth indisponível');
    }
    this.setState('connecting', 'Abrindo seletor Bluetooth…');
    try {
      const info = await api().identify(NIIMBOT_B1_MODEL);
      const label = info?.label || NIIMBOT_MODEL_LABEL;
      this.setState('connected', `Conectado: ${label}`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Falha ao conectar à impressora';
      const lower = raw.toLowerCase();
      let msg = raw;
      if (
        lower.includes('user cancelled') ||
        lower.includes('canceled') ||
        lower.includes('cancelled')
      ) {
        msg = 'Conexão cancelada. Toque em Conectar e escolha a B1 no seletor Bluetooth.';
      } else if (lower.includes('not found') || lower.includes('no devices')) {
        msg =
          'Nenhuma B1 encontrada por Bluetooth. USB não funciona aqui — ligue o Bluetooth da impressora e do PC.';
      } else if (lower.includes('gatt') || lower.includes('bluetooth')) {
        msg = `${raw} — use Bluetooth (não o cabo USB) no Chrome/Edge.`;
      }
      this.setState('disconnected', msg);
      throw new Error(msg);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await api().disconnect();
    } finally {
      this.setState('disconnected', 'Desconectado');
    }
  }

  /**
   * Imprime uma imagem (data URL ou blob URL). Mantém a conexão após o job.
   * Se ainda não estiver conectado, o driver conecta no gesto do usuário.
   */
  async printLabelImageUrl(
    imageUrl: string,
    opts?: { copies?: number; onProgress?: (s: string) => void }
  ): Promise<void> {
    if (!this.isSupported()) {
      this.setState('unsupported', 'Web Bluetooth indisponível');
      throw new Error('Web Bluetooth indisponível');
    }
    const copies = Math.max(1, Math.min(99, Math.floor(opts?.copies ?? 1)));
    this.setState('printing', copies > 1 ? `Imprimindo ${copies} cópias…` : 'Imprimindo…');
    try {
      await api().printImage(imageUrl, {
        model: NIIMBOT_B1_MODEL,
        size: NIIMBOT_T50x30_SIZE,
        copies,
        onProgress: (s) => {
          opts?.onProgress?.(s);
          this.setState('printing', s);
        },
      });
      this.setState('connected', copies > 1 ? `${copies} etiquetas enviadas` : 'Etiqueta enviada');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha na impressão';
      const stillUp = isBleLinkUp();
      this.setState(stillUp ? 'connected' : 'disconnected', msg);
      throw err;
    }
  }
}

export const niimbotService = new NiimbotService();
