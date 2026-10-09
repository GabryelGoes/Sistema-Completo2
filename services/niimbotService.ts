/**
 * Encapsula o driver Web Bluetooth NIIMBOT (vendor) para a PWA.
 * Conexão BLE é mantida entre impressões para reimpressão rápida.
 *
 * Modelo/tamanho alinhados a vendor/niimbot-web-bluetooth/registry-b1.json
 * (B1 @ 203 dpi, T50x30_b1 = 384×240, offset_y_px 4).
 * B1 Pro (300 dpi) é detectado automaticamente após o pareamento.
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

/** Sem filtro de nome — abre o seletor Chrome para qualquer dispositivo BLE. */
const NIIMBOT_DISCOVERY_MODEL: NiimbotModel = {
  name_prefixes: [],
  task: 'b1',
  density: 3,
  label_type: 1,
  speed: 1,
};

export const NIIMBOT_B1_PRO_MODEL: NiimbotModel = {
  name_prefixes: ['B1'],
  task: 'v4',
  density: 3,
  label_type: 1,
  speed: 1,
};

export const NIIMBOT_T50x30_SIZE: NiimbotSize = {
  w_px: 384,
  h_px: 240,
  offset_y_px: 4,
};

/** T50×30 mm no B1 Pro (300 dpi) = 576×354 px (registry upstream). */
export const NIIMBOT_T50x30_PRO_SIZE: NiimbotSize = {
  w_px: 576,
  h_px: 354,
  offset_y_px: 0,
};

export const NIIMBOT_SIZE_LABEL = '50 × 30 mm (B1)';
export const NIIMBOT_MODEL_LABEL = 'Niimbot B1';

/** Dica curta exibida nos modais de etiqueta. */
export const NIIMBOT_BLE_HELP =
  'A B1 só fala com um aparelho por vez: desconecte no celular e feche o app NIIMBOT. Use Chrome/Edge (HTTPS). No Android, ligue também a Localização. Aperte o botão da impressora para ela aparecer. USB não imprime aqui.';

function api() {
  const n = typeof window !== 'undefined' ? window.Niimbot : undefined;
  if (!n) throw new Error('Driver NIIMBOT não carregado.');
  return n;
}

function isBleLinkUp(): boolean {
  try {
    const n = api();
    if (typeof n.isConnected === 'function') return n.isConnected();
    return !!(n.printer && (n as { printer?: unknown }).printer);
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

function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function translateConnectError(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes('user cancelled') ||
    lower.includes('canceled') ||
    lower.includes('cancelled') ||
    lower.includes('abort')
  ) {
    return (
      'Conexão cancelada ou B1 não apareceu na lista. Desconecte no celular, feche o app NIIMBOT, ' +
      'aperte o botão da impressora e toque em Conectar de novo.'
    );
  }
  if (
    lower.includes('notfound') ||
    lower.includes('no devices') ||
    lower.includes('no device') ||
    lower.includes('not found')
  ) {
    return (
      'Nenhuma impressora encontrada. A B1 some da lista se estiver ligada ao celular. ' +
      'Desconecte no app NIIMBOT, no Android ligue a Localização, e tente de novo.'
    );
  }
  if (lower.includes('networkerror') || lower.includes('gatt')) {
    return (
      'Falha no Bluetooth (GATT). Feche o app oficial NIIMBOT, desligue e ligue a impressora, ' +
      'depois toque em Conectar de novo (use Chrome/Edge — não o cabo USB).'
    );
  }
  if (lower.includes('security') || lower.includes('notallowed') || lower.includes('gesture')) {
    return 'O navegador bloqueou o Bluetooth. Toque em Conectar novamente (gesto do usuário) no Chrome/Edge com HTTPS.';
  }
  if (lower.includes('web bluetooth') || lower.includes("doesn't expose web bluetooth")) {
    if (isIosLike()) {
      return 'No iPhone/iPad o Safari/Chrome não tem Web Bluetooth. Use Bluefy ou um PC/Android com Chrome.';
    }
    return 'Web Bluetooth indisponível. Use Chrome ou Edge no Android/desktop (HTTPS).';
  }
  if (lower.includes('connected printer is') && lower.includes('select the')) {
    return `${raw} — reconecte e deixe o app detectar o modelo automaticamente.`;
  }
  if (lower.includes('bluetooth')) {
    return `${raw} — use Bluetooth (não o cabo USB) no Chrome/Edge.`;
  }
  return raw;
}

class NiimbotService {
  private status: NiimbotConnectionStatus = 'disconnected';
  private message: string | null = null;
  private listeners = new Set<Listener>();
  /** Modelo efetivo após identify (B1 ou B1 Pro). */
  private activeModel: NiimbotModel = NIIMBOT_B1_MODEL;
  private activeSize: NiimbotSize = NIIMBOT_T50x30_SIZE;

  constructor() {
    if (typeof window !== 'undefined' && !this.isSupported()) {
      this.status = 'unsupported';
      this.message = isIosLike()
        ? 'Web Bluetooth indisponível no iPhone/iPad. Use Bluefy ou Chrome no Android/PC.'
        : 'Web Bluetooth indisponível. Use Chrome ou Edge no Android/desktop (HTTPS).';
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
    return (
      (this.status === 'connected' || this.status === 'printing') && isBleLinkUp()
    );
  }

  private setState(status: NiimbotConnectionStatus, message: string | null = null) {
    this.status = status;
    this.message = message;
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  private applyDetectedPrinter() {
    const info = api().printer;
    if (info?.task === 'v4' || info?.dpi === 300) {
      this.activeModel = {
        ...NIIMBOT_B1_PRO_MODEL,
        name_prefixes: NIIMBOT_B1_PRO_MODEL.name_prefixes,
      };
      this.activeSize = NIIMBOT_T50x30_PRO_SIZE;
      return info?.label || 'Niimbot B1 Pro';
    }
    this.activeModel = { ...NIIMBOT_B1_MODEL };
    this.activeSize = NIIMBOT_T50x30_SIZE;
    return info?.label || NIIMBOT_MODEL_LABEL;
  }

  /**
   * Limpa o driver SEM await — `disconnect()` do vendor é síncrono no corpo.
   * Await antes de `requestDevice` derruba o gesto do usuário no Chrome e o seletor
   * nem abre (SecurityError) ou falha de forma confusa.
   */
  private clearDriverSync() {
    try {
      void api().disconnect();
    } catch {
      /* already gone */
    }
  }

  private async safeDisconnectDriver() {
    try {
      await api().disconnect();
    } catch {
      /* already gone */
    }
  }

  /**
   * @param options.anyDevice — padrão true: seletor Chrome sem filtro de nome.
   *   A B1 muitas vezes não aparece no filtro "B1" (nome não anunciado / ocupada pelo celular).
   *   Passe `{ anyDevice: false }` para filtrar só por prefixo B1.
   */
  async connect(options?: { anyDevice?: boolean }): Promise<void> {
    if (!this.isSupported()) {
      const msg = isIosLike()
        ? 'Web Bluetooth indisponível no iPhone/iPad. Use Bluefy ou Chrome no Android/PC.'
        : 'Web Bluetooth indisponível. Use Chrome ou Edge no Android/desktop (HTTPS).';
      this.setState('unsupported', msg);
      throw new Error(msg);
    }
    // Sem await aqui — preserva o gesto do usuário até o requestDevice.
    this.clearDriverSync();
    const anyDevice = options?.anyDevice !== false;
    this.setState(
      'connecting',
      anyDevice
        ? 'Abrindo seletor Bluetooth… escolha a B1 na lista'
        : 'Abrindo seletor Bluetooth (filtro B1)…'
    );
    try {
      await api().identify(anyDevice ? NIIMBOT_DISCOVERY_MODEL : NIIMBOT_B1_MODEL);
      const label = this.applyDetectedPrinter();
      this.setState('connected', `Conectado: ${label}`);
    } catch (err) {
      await this.safeDisconnectDriver();
      const raw = err instanceof Error ? err.message : 'Falha ao conectar à impressora';
      let msg = translateConnectError(raw);
      if (/cancelad|cancelled|canceled|abort|notfound|não encontrada|nenhuma b1/i.test(msg)) {
        msg =
          `${msg} Se a B1 não aparece: desconecte no celular, feche o app NIIMBOT, ` +
          'aperte o botão da impressora e tente de novo.';
      }
      this.setState('disconnected', msg);
      throw new Error(msg);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await api().disconnect();
    } finally {
      this.activeModel = { ...NIIMBOT_B1_MODEL };
      this.activeSize = NIIMBOT_T50x30_SIZE;
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
    if (!isBleLinkUp()) {
      await this.connect();
    }
    const copies = Math.max(1, Math.min(99, Math.floor(opts?.copies ?? 1)));
    this.setState('printing', copies > 1 ? `Imprimindo ${copies} cópias…` : 'Imprimindo…');
    try {
      this.applyDetectedPrinter();
      await api().printImage(imageUrl, {
        model: this.activeModel,
        size: this.activeSize,
        copies,
        onProgress: (s) => {
          opts?.onProgress?.(s);
          this.setState('printing', s);
        },
      });
      this.setState('connected', copies > 1 ? `${copies} etiquetas enviadas` : 'Etiqueta enviada');
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Falha na impressão';
      const msg = translateConnectError(raw);
      const stillUp = isBleLinkUp();
      if (!stillUp) {
        await this.safeDisconnectDriver();
      }
      this.setState(stillUp ? 'connected' : 'disconnected', msg);
      throw new Error(msg);
    }
  }
}

export const niimbotService = new NiimbotService();
