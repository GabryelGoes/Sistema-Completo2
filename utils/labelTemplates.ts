/**
 * Layouts editáveis das etiquetas Niimbot (50×30 mm / 384×240 px).
 * Persistidos no dispositivo (localStorage) e usados por lab, estoque, chave e futuras.
 */

/** Dimensões B1 — espelhadas em niimbotLabelRender (evitar ciclo de import). */
const LABEL_W = 384;
const LABEL_H = 240;

export type LabelTemplateId = 'lab_os' | 'estoque' | 'chave';

export type LabelFontFamily =
  | 'Arial'
  | 'Helvetica'
  | 'Verdana'
  | 'Tahoma'
  | 'Trebuchet MS'
  | 'Georgia'
  | 'Times New Roman'
  | 'Courier New'
  | 'Impact';

export type LabelFontWeight = 'normal' | 'bold' | '900';
export type LabelAlign = 'left' | 'center' | 'right';
export type LabelVAlign = 'top' | 'middle' | 'bottom';

export type LabelElementKind =
  | 'qr'
  | 'barcode'
  | 'banner'
  | 'text_field'
  | 'text'
  | 'human_code';

export type LabelElementDef = {
  id: string;
  kind: LabelElementKind;
  /** Nome amigável no editor */
  name: string;
  visible: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  fontFamily: LabelFontFamily;
  fontSize: number;
  fontWeight: LabelFontWeight;
  /** Prefixo / legenda editável (ex.: "Cliente:", "OFICINA", "DEPÓSITO") */
  labelText: string;
  /** Tamanho do valor (banner / campo); se omitido usa fontSize */
  valueFontSize: number;
  align: LabelAlign;
  maxLines: number;
};

export type LabelKeyOptions = {
  letterSpacing: number;
  lineSpacing: number;
  margin: number;
  halfGap: number;
  vAlign: LabelVAlign;
  dualCopy: boolean;
  /** Offset global do bloco (compat com editor antigo da chave) */
  offsetX: number;
  offsetY: number;
};

export type LabelTemplateLayout = {
  id: LabelTemplateId;
  version: 1;
  canvasW: number;
  canvasH: number;
  elements: LabelElementDef[];
  keyOptions?: LabelKeyOptions;
};

export const LABEL_TEMPLATE_META: Array<{
  id: LabelTemplateId;
  title: string;
  description: string;
}> = [
  {
    id: 'lab_os',
    title: 'Laboratório (OS)',
    description: 'QR + oficina + depósito + cliente / veículo / queixa',
  },
  {
    id: 'estoque',
    title: 'Estoque (peça)',
    description: 'Marca, nome, código e Code128',
  },
  {
    id: 'chave',
    title: 'Chave (pátio)',
    description: 'Duas faces verticais — cliente, carro, cor e placa',
  },
];

export const LABEL_FONTS: Array<{ value: LabelFontFamily; label: string }> = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Impact', label: 'Impact' },
];

const STORAGE_KEY = 'rda.labelTemplates.v1';
const LEGACY_CHAVE_KEY = 'rda.patioKeyLabelStyle.v1';

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function el(
  partial: Omit<LabelElementDef, 'fontFamily' | 'fontWeight' | 'align' | 'maxLines' | 'valueFontSize'> &
    Partial<Pick<LabelElementDef, 'fontFamily' | 'fontWeight' | 'align' | 'maxLines' | 'valueFontSize'>>
): LabelElementDef {
  return {
    fontFamily: 'Arial',
    fontWeight: 'bold',
    align: 'left',
    maxLines: 1,
    valueFontSize: partial.fontSize,
    ...partial,
  };
}

export function createDefaultLabOsTemplate(): LabelTemplateLayout {
  return {
    id: 'lab_os',
    version: 1,
    canvasW: LABEL_W,
    canvasH: LABEL_H,
    elements: [
      el({
        id: 'qr',
        kind: 'qr',
        name: 'QR Code',
        visible: true,
        x: 6,
        y: 36,
        w: 168,
        h: 168,
        fontSize: 12,
        labelText: '',
      }),
      el({
        id: 'oficina',
        kind: 'banner',
        name: 'Oficina (letra)',
        visible: true,
        x: 182,
        y: 4,
        w: 194,
        h: 34,
        fontSize: 12,
        valueFontSize: 28,
        labelText: 'OFICINA',
      }),
      el({
        id: 'deposito',
        kind: 'banner',
        name: 'Depósito (vaga)',
        visible: true,
        x: 182,
        y: 42,
        w: 194,
        h: 34,
        fontSize: 12,
        valueFontSize: 28,
        labelText: 'DEPÓSITO',
      }),
      el({
        id: 'customer',
        kind: 'text_field',
        name: 'Cliente',
        visible: true,
        x: 182,
        y: 84,
        w: 194,
        h: 40,
        fontSize: 14,
        valueFontSize: 18,
        labelText: 'Cliente:',
        maxLines: 2,
      }),
      el({
        id: 'vehicle',
        kind: 'text_field',
        name: 'Veículo',
        visible: true,
        x: 182,
        y: 128,
        w: 194,
        h: 40,
        fontSize: 14,
        valueFontSize: 18,
        labelText: 'Veículo:',
        maxLines: 2,
      }),
      el({
        id: 'complaint',
        kind: 'text_field',
        name: 'Queixa',
        visible: true,
        x: 182,
        y: 172,
        w: 194,
        h: 60,
        fontSize: 14,
        valueFontSize: 15,
        fontWeight: 'normal',
        labelText: 'Queixa:',
        maxLines: 3,
      }),
    ],
  };
}

export function createDefaultEstoqueTemplate(): LabelTemplateLayout {
  return {
    id: 'estoque',
    version: 1,
    canvasW: LABEL_W,
    canvasH: LABEL_H,
    elements: [
      el({
        id: 'brand',
        kind: 'text',
        name: 'Marca',
        visible: true,
        x: 10,
        y: 8,
        w: 364,
        h: 26,
        fontSize: 22,
        labelText: '',
      }),
      el({
        id: 'name',
        kind: 'text',
        name: 'Nome do produto',
        visible: true,
        x: 10,
        y: 36,
        w: 364,
        h: 24,
        fontSize: 18,
        labelText: '',
      }),
      el({
        id: 'code_line',
        kind: 'text_field',
        name: 'Linha do código',
        visible: true,
        x: 10,
        y: 62,
        w: 364,
        h: 20,
        fontSize: 14,
        fontWeight: 'normal',
        valueFontSize: 14,
        labelText: 'Código:',
        maxLines: 1,
      }),
      el({
        id: 'barcode',
        kind: 'barcode',
        name: 'Código de barras',
        visible: true,
        x: 10,
        y: 88,
        w: 364,
        h: 96,
        fontSize: 12,
        labelText: '',
      }),
      el({
        id: 'human_code',
        kind: 'human_code',
        name: 'Código legível',
        visible: true,
        x: 10,
        y: 196,
        w: 364,
        h: 28,
        fontSize: 16,
        labelText: '',
        align: 'center',
      }),
    ],
  };
}

export function createDefaultChaveTemplate(): LabelTemplateLayout {
  return {
    id: 'chave',
    version: 1,
    canvasW: LABEL_W,
    canvasH: LABEL_H,
    keyOptions: {
      letterSpacing: 0,
      lineSpacing: 1,
      margin: 4,
      halfGap: 2,
      vAlign: 'middle',
      dualCopy: true,
      offsetX: 0,
      offsetY: 0,
    },
    elements: [
      el({
        id: 'customer',
        kind: 'text_field',
        name: 'Cliente',
        visible: true,
        x: 0,
        y: 0,
        w: 240,
        h: 28,
        fontSize: 18,
        labelText: 'Cliente:',
      }),
      el({
        id: 'vehicle',
        kind: 'text_field',
        name: 'Carro',
        visible: true,
        x: 0,
        y: 28,
        w: 240,
        h: 28,
        fontSize: 18,
        labelText: 'Carro:',
      }),
      el({
        id: 'color',
        kind: 'text_field',
        name: 'Cor',
        visible: true,
        x: 0,
        y: 56,
        w: 240,
        h: 28,
        fontSize: 18,
        labelText: 'Cor:',
      }),
      el({
        id: 'plate',
        kind: 'text_field',
        name: 'Placa',
        visible: true,
        x: 0,
        y: 84,
        w: 240,
        h: 28,
        fontSize: 18,
        labelText: 'Placa:',
      }),
    ],
  };
}

export function createDefaultTemplate(id: LabelTemplateId): LabelTemplateLayout {
  if (id === 'estoque') return createDefaultEstoqueTemplate();
  if (id === 'chave') return createDefaultChaveTemplate();
  return createDefaultLabOsTemplate();
}

function normalizeFontFamily(v: unknown): LabelFontFamily {
  return LABEL_FONTS.some((f) => f.value === v)
    ? (v as LabelFontFamily)
    : 'Arial';
}

function normalizeWeight(v: unknown): LabelFontWeight {
  return v === 'normal' || v === 'bold' || v === '900' ? v : 'bold';
}

function normalizeAlign(v: unknown): LabelAlign {
  return v === 'center' || v === 'right' ? v : 'left';
}

function normalizeVAlign(v: unknown): LabelVAlign {
  return v === 'top' || v === 'bottom' ? v : 'middle';
}

function normalizeElement(raw: Partial<LabelElementDef>, fallback: LabelElementDef): LabelElementDef {
  return {
    id: fallback.id,
    kind: fallback.kind,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallback.name,
    visible: raw.visible !== false,
    x: clamp(Math.round(Number(raw.x ?? fallback.x)), -40, LABEL_W + 40),
    y: clamp(Math.round(Number(raw.y ?? fallback.y)), -40, LABEL_H + 40),
    w: clamp(Math.round(Number(raw.w ?? fallback.w)), 8, LABEL_W),
    h: clamp(Math.round(Number(raw.h ?? fallback.h)), 8, LABEL_H),
    fontFamily: normalizeFontFamily(raw.fontFamily ?? fallback.fontFamily),
    fontSize: clamp(Math.round(Number(raw.fontSize ?? fallback.fontSize)), 6, 72),
    fontWeight: normalizeWeight(raw.fontWeight ?? fallback.fontWeight),
    labelText: typeof raw.labelText === 'string' ? raw.labelText : fallback.labelText,
    valueFontSize: clamp(
      Math.round(Number(raw.valueFontSize ?? raw.fontSize ?? fallback.valueFontSize)),
      6,
      96
    ),
    align: normalizeAlign(raw.align ?? fallback.align),
    maxLines: clamp(Math.round(Number(raw.maxLines ?? fallback.maxLines)), 1, 12),
  };
}

function normalizeKeyOptions(
  raw: Partial<LabelKeyOptions> | undefined,
  fallback: LabelKeyOptions
): LabelKeyOptions {
  const src = raw ?? {};
  return {
    letterSpacing: clamp(Number(src.letterSpacing ?? fallback.letterSpacing) || 0, -2, 8),
    lineSpacing: clamp(Number(src.lineSpacing ?? fallback.lineSpacing) || 1, 0.7, 1.8),
    margin: clamp(Math.round(Number(src.margin ?? fallback.margin)), 0, 16),
    halfGap: clamp(Math.round(Number(src.halfGap ?? fallback.halfGap)), 0, 12),
    vAlign: normalizeVAlign(src.vAlign ?? fallback.vAlign),
    dualCopy: src.dualCopy !== false,
    offsetX: clamp(Math.round(Number(src.offsetX ?? fallback.offsetX)), -40, 40),
    offsetY: clamp(Math.round(Number(src.offsetY ?? fallback.offsetY)), -40, 40),
  };
}

export function normalizeLabelTemplate(
  id: LabelTemplateId,
  raw: Partial<LabelTemplateLayout> | null | undefined
): LabelTemplateLayout {
  const def = createDefaultTemplate(id);
  const byId = new Map((raw?.elements ?? []).map((e) => [e.id, e]));
  const elements = def.elements.map((fallback) =>
    normalizeElement(byId.get(fallback.id) ?? {}, fallback)
  );
  // Elementos extras salvos (futuras etiquetas) — preserva se tiverem id/kind
  for (const extra of raw?.elements ?? []) {
    if (!extra?.id || elements.some((e) => e.id === extra.id)) continue;
    if (!extra.kind) continue;
    elements.push(
      normalizeElement(extra, {
        ...el({
          id: extra.id,
          kind: extra.kind,
          name: extra.name || extra.id,
          visible: true,
          x: 0,
          y: 0,
          w: 100,
          h: 24,
          fontSize: 14,
          labelText: '',
        }),
        ...extra,
      })
    );
  }
  return {
    id,
    version: 1,
    canvasW: LABEL_W,
    canvasH: LABEL_H,
    elements,
    keyOptions:
      id === 'chave'
        ? normalizeKeyOptions(raw?.keyOptions, def.keyOptions!)
        : undefined,
  };
}

export type LabelTemplatesStore = Record<LabelTemplateId, LabelTemplateLayout>;

function migrateLegacyChave(): LabelTemplateLayout | null {
  try {
    const raw = localStorage.getItem(LEGACY_CHAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const base = createDefaultChaveTemplate();
    const fontSize = clamp(Math.round(Number(parsed.fontSize ?? 18)), 8, 36);
    const fontFamily = normalizeFontFamily(parsed.fontFamily);
    const fontWeight = normalizeWeight(parsed.fontWeight);
    const showLabels = parsed.showLabels !== false;
    const elements = base.elements.map((e) => ({
      ...e,
      fontFamily,
      fontSize,
      valueFontSize: fontSize,
      fontWeight,
      labelText: showLabels ? e.labelText : '',
      visible: true,
    }));
    return normalizeLabelTemplate('chave', {
      ...base,
      elements,
      keyOptions: {
        letterSpacing: Number(parsed.letterSpacing) || 0,
        lineSpacing: Number(parsed.lineSpacing) || 1,
        margin: Number(parsed.margin) || 4,
        halfGap: Number(parsed.halfGap) || 2,
        vAlign: normalizeVAlign(parsed.vAlign),
        dualCopy: true,
        offsetX: Number(parsed.offsetX) || 0,
        offsetY: Number(parsed.offsetY) || 0,
      },
    });
  } catch {
    return null;
  }
}

export function loadAllLabelTemplates(): LabelTemplatesStore {
  const defaults: LabelTemplatesStore = {
    lab_os: createDefaultLabOsTemplate(),
    estoque: createDefaultEstoqueTemplate(),
    chave: createDefaultChaveTemplate(),
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<LabelTemplateId, Partial<LabelTemplateLayout>>>;
      return {
        lab_os: normalizeLabelTemplate('lab_os', parsed.lab_os),
        estoque: normalizeLabelTemplate('estoque', parsed.estoque),
        chave: normalizeLabelTemplate('chave', parsed.chave),
      };
    }
  } catch {
    /* ignore */
  }
  const legacy = migrateLegacyChave();
  if (legacy) {
    defaults.chave = legacy;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    } catch {
      /* ignore */
    }
  }
  return defaults;
}

export function loadLabelTemplate(id: LabelTemplateId): LabelTemplateLayout {
  return loadAllLabelTemplates()[id];
}

export function saveLabelTemplate(layout: LabelTemplateLayout): void {
  const all = loadAllLabelTemplates();
  all[layout.id] = normalizeLabelTemplate(layout.id, layout);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}

export function saveAllLabelTemplates(store: LabelTemplatesStore): void {
  const next: LabelTemplatesStore = {
    lab_os: normalizeLabelTemplate('lab_os', store.lab_os),
    estoque: normalizeLabelTemplate('estoque', store.estoque),
    chave: normalizeLabelTemplate('chave', store.chave),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function resetLabelTemplate(id: LabelTemplateId): LabelTemplateLayout {
  const next = createDefaultTemplate(id);
  saveLabelTemplate(next);
  return next;
}

export function cssFontForElement(elDef: LabelElementDef, size = elDef.fontSize): string {
  const weight =
    elDef.fontWeight === '900' ? '900' : elDef.fontWeight === 'normal' ? '400' : '700';
  return `${weight} ${size}px "${elDef.fontFamily}", Arial, sans-serif`;
}

/** Dados de amostra para pré-visualização no editor. */
export const LABEL_SAMPLE_DATA = {
  lab_os: {
    serviceOrderId: '00000000-0000-4000-8000-000000000001',
    customerName: 'JOÃO SILVA',
    vehicleName: 'GOL 1.6 MSI',
    complaint: 'ABS acende no painel após frear em buraco',
    benchSlot: 7,
    oficinaShelf: 'C',
  },
  estoque: {
    brand: 'REI DO ABS',
    name: 'SENSOR ABS DIANTEIRO',
    code: '7891234567890',
  },
  chave: {
    customerName: 'MARIA SANTOS',
    vehicleModel: 'COROLLA XEI',
    vehicleColor: 'PRATA',
    plate: 'ABC1D23',
  },
} as const;
