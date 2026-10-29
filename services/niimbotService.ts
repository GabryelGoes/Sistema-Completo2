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

/**
 * Prefixo de nomes anunciados pelas impressoras Niimbot (B1 e família).
 * O seletor Chrome só lista aparelhos próximos que anunciam um destes prefixos —
 * evita a lista enorme de Bluetooth genérico.
 */
const NIIMBOT_PRINTER_NAME_PREFIXES = [
  'B1',
  'B21',
  'B3',
  'D11',
  'D110',
  'N31',
  'N41',
  'M2',
  'Niimbot',
  'NIIMBOT',
];

/**
 * Tipos de papel (SetLabelType 0x23) — wiki NIIMBOT / niimbluelib LabelType.
 * B1 oficial: 1, 2, 5. Contínuo (3) existe no protocolo mas a B1 não lista —
 * bobina de máquina de cartão (sem gaps) costuma funcionar com 5 (transparente)
 * ou 3; tentamos nessa ordem.
 */
export const NIIMBOT_LABEL_TYPE_GAPS = 1;
export const NIIMBOT_LABEL_TYPE_BLACK = 2;
export const NIIMBOT_LABEL_TYPE_CONTINUOUS = 3;
export const NIIMBOT_LABEL_TYPE_TRANSPARENT = 5;

export type NiimbotPaperKind = 'roll' | 'continuous' | 'transparent' | 'black';

/** Tipos a tentar por modo de papel (primeiro = preferido). */
export function niimbotLabelTypesForPaper(kind: NiimbotPaperKind): number[] {
  switch (kind) {
    case 'continuous':
      return [NIIMBOT_LABEL_TYPE_CONTINUOUS, NIIMBOT_LABEL_TYPE_TRANSPARENT];
    case 'transparent':
      return [NIIMBOT_LABEL_TYPE_TRANSPARENT];
    case 'black':
      return [NIIMBOT_LABEL_TYPE_BLACK];
    case 'roll':
    default:
      // Bobina térmica sem gaps (cartão): transparente (suportado na B1) → contínuo.
      return [NIIMBOT_LABEL_TYPE_TRANSPARENT, NIIMBOT_LABEL_TYPE_CONTINUOUS, NIIMBOT_LABEL_TYPE_BLACK];
  }
}

export const NIIMBOT_B1_MODEL: NiimbotModel = {
  name_prefixes: [...NIIMBOT_PRINTER_NAME_PREFIXES],
  task: 'b1',
  density: 3,
  label_type: NIIMBOT_LABEL_TYPE_GAPS,
  speed: 1,
};

/** Sem filtro de nome — abre o seletor Chrome para qualquer dispositivo BLE (fallback). */
const NIIMBOT_DISCOVERY_MODEL: NiimbotModel = {
  name_prefixes: [],
  task: 'b1',
  density: 3,
  label_type: NIIMBOT_LABEL_TYPE_GAPS,
  speed: 1,
};

export const NIIMBOT_B1_PRO_MODEL: NiimbotModel = {
  name_prefixes: [...NIIMBOT_PRINTER_NAME_PREFIXES],
  task: 'v4',
  density: 3,
  label_type: NIIMBOT_LABEL_TYPE_GAPS,
  speed: 1,
};

const REMEMBERED_DEVICE_STORAGE_KEY = 'rei_do_abs_niimbot_ble_device';

type RememberedBleDevice = {
  id: string;
  name: string | null;
  savedAt: string;
};

function loadRememberedDevice(): RememberedBleDevice | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(REMEMBERED_DEVICE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as RememberedBleDevice;
    if (!data || typeof data.id !== 'string' || !data.id.trim()) return null;
    return {
      id: data.id.trim(),
      name: typeof data.name === 'string' ? data.name : null,
      savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function saveRememberedDevice(id: string, name: string | null): void {
  if (typeof localStorage === 'undefined' || !id.trim()) return;
  try {
    const payload: RememberedBleDevice = {
      id: id.trim(),
      name: name && name.trim() ? name.trim() : null,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(REMEMBERED_DEVICE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function rememberCurrentBleDevice(): void {
  try {
    const n = api();
    const dev = typeof n.getDevice === 'function' ? n.getDevice() : null;
    if (dev?.id) saveRememberedDevice(dev.id, dev.name ?? null);
  } catch {
    /* ignore */
  }
}

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
export const NIIMBOT_CONTINUOUS_SIZE_LABEL = 'Bobina 50 mm · altura livre (B1)';
export const NIIMBOT_MODEL_LABEL = 'Niimbot B1';

/** Dica curta exibida nos modais de etiqueta. */
export const NIIMBOT_BLE_HELP =
  'A lista mostra só impressoras Niimbot ligadas por perto. Na primeira conexão a B1 é salva e nas próximas o app tenta reconectar sozinho. A B1 só fala com um aparelho por vez: desconecte no celular e feche o app NIIMBOT. Use Chrome/Edge (HTTPS). No Android, ligue a Localização e aperte o botão da impressora.';

export const NIIMBOT_CONTINUOUS_HELP =
  'Bobina térmica 50 mm (máquina de cartão): largura útil ~48 mm (384 px @ 203 dpi), altura conforme o conteúdo. Se a B1 recusar papel sem RFID Niimbot, cole a tag RFID de um rolo original na caixa da impressora (abre a tampa, cola a tag e fecha).';

/** Largura do cabeçote B1 (203 dpi) — múltiplo de 8. */
export const NIIMBOT_B1_HEAD_W_PX = 384;
/** Largura do cabeçote B1 Pro (300 dpi). */
export const NIIMBOT_B1_PRO_HEAD_W_PX = 576;

function roundUpToMultiple(n: number, multiple: number): number {
  const m = Math.max(1, multiple | 0);
  return Math.ceil(Math.max(1, n) / m) * m;
}

function loadImageNaturalSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        w: Math.max(1, img.naturalWidth || img.width),
        h: Math.max(1, img.naturalHeight || img.height),
      });
    img.onerror = () => reject(new Error('Não foi possível ler a imagem para impressão.'));
    img.src = url;
  });
}

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
   * @param options.anyDevice — padrão false: seletor só com impressoras Niimbot próximas.
   *   Passe `{ anyDevice: true }` para listar qualquer BLE (fallback raro).
   * @param options.forceChooser — não tenta reconectar o aparelho salvo; abre o seletor.
   */
  async connect(options?: { anyDevice?: boolean; forceChooser?: boolean }): Promise<void> {
    if (!this.isSupported()) {
      const msg = isIosLike()
        ? 'Web Bluetooth indisponível no iPhone/iPad. Use Bluefy ou Chrome no Android/PC.'
        : 'Web Bluetooth indisponível. Use Chrome ou Edge no Android/desktop (HTTPS).';
      this.setState('unsupported', msg);
      throw new Error(msg);
    }
    // Sem await aqui — preserva o gesto do usuário até o requestDevice / reconnect.
    this.clearDriverSync();
    const anyDevice = options?.anyDevice === true;
    const forceChooser = options?.forceChooser === true;
    const remembered = !forceChooser && !anyDevice ? loadRememberedDevice() : null;
    const model = anyDevice ? NIIMBOT_DISCOVERY_MODEL : NIIMBOT_B1_MODEL;

    if (remembered?.id) {
      this.setState(
        'connecting',
        remembered.name
          ? `Reconectando ${remembered.name}…`
          : 'Reconectando impressora salva…'
      );
      try {
        await api().identify(model, { preferredDeviceId: remembered.id });
        rememberCurrentBleDevice();
        const label = this.applyDetectedPrinter();
        this.setState('connected', `Conectado: ${label}`);
        return;
      } catch {
        // Impressora desligada/fora de alcance — cai no seletor filtrado.
        this.clearDriverSync();
      }
    }

    this.setState(
      'connecting',
      anyDevice
        ? 'Abrindo seletor Bluetooth… escolha a impressora na lista'
        : 'Abrindo seletor… só impressoras Niimbot por perto'
    );
    try {
      await api().identify(model);
      rememberCurrentBleDevice();
      const label = this.applyDetectedPrinter();
      this.setState('connected', `Conectado: ${label}`);
    } catch (err) {
      await this.safeDisconnectDriver();
      const raw = err instanceof Error ? err.message : 'Falha ao conectar à impressora';
      let msg = translateConnectError(raw);
      if (/cancelad|cancelled|canceled|abort|notfound|não encontrada|nenhuma b1/i.test(msg)) {
        msg =
          `${msg} Se a B1 não aparece: desconecte no celular, feche o app NIIMBOT, ` +
          'aperte o botão da impressora e tente de novo. Use “Ver todos” só se o nome dela não começar com B1.';
      }
      this.setState('disconnected', msg);
      throw new Error(msg);
    }
  }

  /** Nome do aparelho BLE lembrado (se houver), para a UI. */
  getRememberedPrinterLabel(): string | null {
    const rem = loadRememberedDevice();
    if (!rem) return null;
    return rem.name?.trim() || 'Impressora salva';
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

  /** Largura do cabeçote em px (203 dpi B1 = 384; 300 dpi Pro = 576). */
  getPrintHeadWidthPx(): number {
    this.applyDetectedPrinter();
    return this.activeSize.w_px;
  }

  /**
   * Imprime uma imagem (data URL ou blob URL). Mantém a conexão após o job.
   * Se ainda não estiver conectado, o driver conecta no gesto do usuário.
   * Usa papel com gaps (etiquetas 50×30).
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
        model: { ...this.activeModel, label_type: NIIMBOT_LABEL_TYPE_GAPS },
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

  /**
   * Imprime bobina contínua / sem gaps (50 mm).
   * Altura = altura da imagem (ilimitada no sentido da bobina); largura = cabeçote.
   * A B1 lista tipos 1/2/5; para bobina de cartão tentamos transparente→contínuo→marca preta.
   */
  async printContinuousImageUrl(
    imageUrl: string,
    opts?: {
      copies?: number;
      density?: number;
      paperKind?: NiimbotPaperKind;
      onProgress?: (s: string) => void;
    }
  ): Promise<void> {
    if (!this.isSupported()) {
      this.setState('unsupported', 'Web Bluetooth indisponível');
      throw new Error('Web Bluetooth indisponível');
    }
    if (!isBleLinkUp()) {
      await this.connect();
    }
    const copies = Math.max(1, Math.min(99, Math.floor(opts?.copies ?? 1)));
    const densityRaw = opts?.density ?? 4;
    const density = Math.min(5, Math.max(1, Math.floor(densityRaw)));
    const paperKind: NiimbotPaperKind = opts?.paperKind ?? 'roll';
    const labelTypes = niimbotLabelTypesForPaper(paperKind);

    this.setState('printing', copies > 1 ? `Imprimindo ${copies} vias…` : 'Imprimindo bobina…');
    this.applyDetectedPrinter();
    const natural = await loadImageNaturalSize(imageUrl);
    const headW = roundUpToMultiple(this.activeSize.w_px || NIIMBOT_B1_HEAD_W_PX, 8);
    // Imagem já deve vir na largura do cabeçote; se não, escala a altura proporcionalmente.
    const w = headW;
    const scaledH = Math.round((natural.h * headW) / Math.max(1, natural.w));
    const h = roundUpToMultiple(Math.min(6000, Math.max(64, scaledH)), 8);
    const size: NiimbotSize = { w_px: w, h_px: h, offset_y_px: 0 };

    let lastErr: Error | null = null;
    for (let i = 0; i < labelTypes.length; i += 1) {
      const labelType = labelTypes[i]!;
      try {
        opts?.onProgress?.(
          labelTypes.length > 1
            ? `Papel tipo ${labelType} (${i + 1}/${labelTypes.length})…`
            : 'Enviando…'
        );
        this.setState(
          'printing',
          `Imprimindo (tipo ${labelType}${i > 0 ? ', nova tentativa' : ''})…`
        );
        await api().printImage(imageUrl, {
          model: {
            ...this.activeModel,
            label_type: labelType,
            density,
          },
          size,
          copies,
          density,
          onProgress: (s) => {
            opts?.onProgress?.(s);
            this.setState('printing', s);
          },
        });
        this.setState(
          'connected',
          copies > 1 ? `${copies} vias enviadas (tipo ${labelType})` : `Via enviada (tipo ${labelType})`
        );
        return;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (!isBleLinkUp()) break;
      }
    }

    const raw = lastErr?.message || 'Falha na impressão da bobina';
    let msg = translateConnectError(raw);
    if (/paper|papel|rfid|lid|tampa|consumable|não confirmad|not confirmed/i.test(msg)) {
      msg =
        `${msg} Dica: cole a tag RFID de um rolo Niimbot na caixa da B1 e use bobina 50 mm; ` +
        'no modal escolha «Bobina 50 mm» ou «Transparente».';
    }
    const stillUp = isBleLinkUp();
    if (!stillUp) {
      await this.safeDisconnectDriver();
    }
    this.setState(stillUp ? 'connected' : 'disconnected', msg);
    throw new Error(msg);
  }
}

export const niimbotService = new NiimbotService();
