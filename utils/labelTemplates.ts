/**
 * Layouts editáveis das etiquetas Niimbot (50×30 mm / 384×240 px).
 * Persistidos no dispositivo (localStorage) e usados por lab, estoque, chave, peças e futuras.
 */

/** Dimensões B1 — espelhadas em niimbotLabelRender (evitar ciclo de import). */
const LABEL_W = 384;
const LABEL_H = 240;

export type LabelTemplateId = 'lab_os' | 'estoque' | 'chave' | 'pecas_os' | 'abs_modulo';

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
  | 'human_code'
  | 'logo';

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
  /**
   * Opacidade 0–100 (100 = sólido). Valores menores criam marca d'água
   * (dither na impressão térmica).
   */
  opacity: number;
  /** Rotação em graus (horário; centro do elemento). */
  rotation: number;
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
  /** Se true, a placa é desenhada no estilo Mercosul; se false, texto tradicional. */
  mercosulPlate: boolean;
};

/** Ícone da faixa preta (etiqueta de peças). */
export type LabelPecasSidebarIcon =
  | 'car_gear'
  | 'car'
  | 'gear'
  | 'wrench'
  | 'tag'
  | 'none';

export const LABEL_PECAS_SIDEBAR_ICONS: Array<{
  value: LabelPecasSidebarIcon;
  label: string;
}> = [
  { value: 'car_gear', label: 'Carro + engrenagem' },
  { value: 'car', label: 'Carro' },
  { value: 'gear', label: 'Engrenagem' },
  { value: 'wrench', label: 'Chave' },
  { value: 'tag', label: 'Etiqueta' },
  { value: 'none', label: 'Sem ícone' },
];

/** Opções exclusivas do layout mockup de peças. */
export type LabelPecasOptions = {
  /** Largura da faixa preta no topo (px no canvas 384). */
  sidebarWidth: number;
  /** Texto na faixa (ex.: PEÇA). */
  sidebarText: string;
  sidebarTextSize: number;
  sidebarIcon: LabelPecasSidebarIcon;
  sidebarIconSize: number;
  /** Barra branca sob o texto da faixa. */
  showSidebarBar: boolean;
  showPlateIcon: boolean;
  showColorIcon: boolean;
  showCustomerIcon: boolean;
  fieldIconSize: number;
};

/** Âncora do texto SVG na etiqueta de chaves (−90°). */
export type LabelChaveSvgAnchor = 'start' | 'middle' | 'end';

/** Layout editável de um campo no SVG-base de chaves (unidades do viewBox 500×300). */
export type LabelChaveSvgFieldLayout = {
  /** Deslocamento perpendicular ao texto (eixo X da face). */
  offsetX: number;
  /** Deslocamento ao longo do texto (eixo Y da face). */
  offsetY: number;
  fontSize: number;
  maxWidth: number;
  anchor: LabelChaveSvgAnchor;
};

export type LabelChaveSvgFieldKey = 'modelo' | 'cor' | 'cliente' | 'placa';

/** Opções do editor SVG da etiqueta de chaves. */
export type LabelChaveSvgOptions = {
  fields: Record<LabelChaveSvgFieldKey, LabelChaveSvgFieldLayout>;
};

export type LabelTemplateLayout = {
  id: LabelTemplateId;
  version: number;
  canvasW: number;
  canvasH: number;
  elements: LabelElementDef[];
  keyOptions?: LabelKeyOptions;
  pecasOptions?: LabelPecasOptions;
  chaveSvgOptions?: LabelChaveSvgOptions;
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
    description: 'Duas faces verticais — cliente, carro, cor e placa Mercosul',
  },
  {
    id: 'pecas_os',
    title: 'Peças (OS veículo)',
    description: 'Mockup editável — faixa, ícones, tipografia e campos',
  },
  {
    id: 'abs_modulo',
    title: 'Módulo ABS',
    description: 'Fabricante, aplicação, código, local e Code128',
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
  partial: Omit<
    LabelElementDef,
    'fontFamily' | 'fontWeight' | 'align' | 'maxLines' | 'valueFontSize' | 'opacity' | 'rotation'
  > &
    Partial<
      Pick<
        LabelElementDef,
        'fontFamily' | 'fontWeight' | 'align' | 'maxLines' | 'valueFontSize' | 'opacity' | 'rotation'
      >
    >
): LabelElementDef {
  return {
    fontFamily: 'Arial',
    fontWeight: 'bold',
    align: 'left',
    maxLines: 1,
    valueFontSize: partial.fontSize,
    opacity: 100,
    rotation: 0,
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
        id: 'location',
        kind: 'banner',
        name: 'Local atual',
        visible: true,
        x: 182,
        y: 4,
        w: 194,
        h: 44,
        fontSize: 14,
        valueFontSize: 32,
        labelText: '',
      }),
      el({
        id: 'customer',
        kind: 'text_field',
        name: 'Cliente',
        visible: true,
        x: 182,
        y: 56,
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
        y: 100,
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
        y: 144,
        w: 194,
        h: 88,
        fontSize: 14,
        valueFontSize: 15,
        fontWeight: 'normal',
        labelText: 'Queixa:',
        maxLines: 4,
      }),
      // Legados (ocultos) — templates antigos ainda carregam
      el({
        id: 'oficina',
        kind: 'banner',
        name: 'Oficina (legado)',
        visible: false,
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
        name: 'Depósito (legado)',
        visible: false,
        x: 182,
        y: 42,
        w: 194,
        h: 34,
        fontSize: 12,
        valueFontSize: 28,
        labelText: 'DEP',
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

export function createDefaultChaveSvgOptions(): LabelChaveSvgOptions {
  return {
    fields: {
      modelo: { offsetX: 0, offsetY: 0, fontSize: 26, maxWidth: 240, anchor: 'middle' },
      cor: { offsetX: 0, offsetY: 0, fontSize: 20, maxWidth: 220, anchor: 'middle' },
      cliente: { offsetX: 0, offsetY: 0, fontSize: 16, maxWidth: 256, anchor: 'middle' },
      placa: { offsetX: 0, offsetY: 0, fontSize: 24, maxWidth: 177, anchor: 'middle' },
    },
  };
}

function normalizeChaveSvgAnchor(v: unknown, fallback: LabelChaveSvgAnchor): LabelChaveSvgAnchor {
  return v === 'start' || v === 'middle' || v === 'end' ? v : fallback;
}

export function normalizeChaveSvgOptions(
  raw: Partial<LabelChaveSvgOptions> | undefined,
  fallback: LabelChaveSvgOptions = createDefaultChaveSvgOptions()
): LabelChaveSvgOptions {
  const srcFields = raw?.fields ?? {};
  const out = createDefaultChaveSvgOptions();
  (Object.keys(out.fields) as LabelChaveSvgFieldKey[]).forEach((key) => {
    const fb = fallback.fields[key];
    const src = (srcFields as Partial<Record<LabelChaveSvgFieldKey, Partial<LabelChaveSvgFieldLayout>>>)[
      key
    ];
    out.fields[key] = {
      offsetX: clamp(Math.round(Number(src?.offsetX ?? fb.offsetX)), -40, 40),
      offsetY: clamp(Math.round(Number(src?.offsetY ?? fb.offsetY)), -60, 60),
      fontSize: clamp(Math.round(Number(src?.fontSize ?? fb.fontSize)), 8, 48),
      maxWidth: clamp(Math.round(Number(src?.maxWidth ?? fb.maxWidth)), 40, 280),
      anchor: normalizeChaveSvgAnchor(src?.anchor ?? fb.anchor, fb.anchor),
    };
  });
  return out;
}

export function createDefaultChaveTemplate(): LabelTemplateLayout {
  // SVG-base fixo (v4+): chaveSvgOptions alinha textos no template.
  return {
    id: 'chave',
    version: 4,
    canvasW: LABEL_W,
    canvasH: LABEL_H,
    keyOptions: {
      letterSpacing: 0,
      lineSpacing: 1,
      margin: 4,
      halfGap: 2,
      vAlign: 'top',
      dualCopy: true,
      offsetX: 0,
      offsetY: 0,
      mercosulPlate: true,
    },
    chaveSvgOptions: createDefaultChaveSvgOptions(),
    elements: [
      el({
        id: 'customer',
        kind: 'text_field',
        name: 'Cliente',
        visible: true,
        x: 6,
        y: 6,
        w: 228,
        h: 26,
        fontSize: 16,
        valueFontSize: 18,
        labelText: '👤 ',
      }),
      el({
        id: 'vehicle',
        kind: 'text_field',
        name: 'Carro',
        visible: true,
        x: 6,
        y: 34,
        w: 228,
        h: 26,
        fontSize: 16,
        valueFontSize: 18,
        labelText: '🚗 ',
      }),
      el({
        id: 'color',
        kind: 'text_field',
        name: 'Cor',
        visible: true,
        x: 6,
        y: 62,
        w: 228,
        h: 26,
        fontSize: 16,
        valueFontSize: 18,
        labelText: '🎨 ',
      }),
      el({
        id: 'plate',
        kind: 'text_field',
        name: 'Placa',
        visible: true,
        x: 10,
        y: 96,
        w: 220,
        h: 78,
        fontSize: 12,
        valueFontSize: 28,
        labelText: '',
        align: 'center',
      }),
    ],
  };
}

export function createDefaultPecasOptions(): LabelPecasOptions {
  return {
    sidebarWidth: 78,
    sidebarText: 'PEÇA',
    sidebarTextSize: 28,
    sidebarIcon: 'car_gear',
    sidebarIconSize: 44,
    showSidebarBar: true,
    showPlateIcon: true,
    showColorIcon: true,
    showCustomerIcon: true,
    fieldIconSize: 22,
  };
}

/**
 * Etiqueta de peças da OS (pátio) — mockup editável (faixa PEÇA + campos).
 * `pecasOptions` controla faixa/ícones; `elements` controlam tipografia e títulos.
 */
export function createDefaultPecasOsTemplate(): LabelTemplateLayout {
  return {
    id: 'pecas_os',
    version: 3,
    canvasW: LABEL_W,
    canvasH: LABEL_H,
    keyOptions: {
      letterSpacing: 0,
      lineSpacing: 1,
      margin: 4,
      halfGap: 2,
      vAlign: 'middle',
      dualCopy: false,
      offsetX: 0,
      offsetY: 0,
      mercosulPlate: true,
    },
    pecasOptions: createDefaultPecasOptions(),
    elements: [
      el({
        id: 'vehicle',
        kind: 'text_field',
        name: 'Veículo',
        visible: true,
        x: 90,
        y: 14,
        w: 280,
        h: 48,
        fontSize: 15,
        valueFontSize: 46,
        fontWeight: '900',
        labelText: '',
        align: 'left',
      }),
      el({
        id: 'plate',
        kind: 'text_field',
        name: 'Placa',
        visible: true,
        x: 90,
        y: 100,
        w: 140,
        h: 50,
        fontSize: 10,
        valueFontSize: 18,
        fontWeight: '900',
        labelText: 'PLACA',
        align: 'left',
      }),
      el({
        id: 'color',
        kind: 'text_field',
        name: 'Cor',
        visible: true,
        x: 240,
        y: 100,
        w: 130,
        h: 50,
        fontSize: 10,
        valueFontSize: 18,
        fontWeight: '900',
        labelText: 'COR',
        align: 'left',
      }),
      el({
        id: 'customer',
        kind: 'text_field',
        name: 'Cliente',
        visible: true,
        x: 90,
        y: 180,
        w: 280,
        h: 28,
        fontSize: 15,
        valueFontSize: 15,
        fontWeight: 'bold',
        labelText: 'CLIENTE:',
        align: 'left',
      }),
    ],
  };
}

export function createDefaultAbsModuloTemplate(): LabelTemplateLayout {
  return {
    id: 'abs_modulo',
    version: 5,
    canvasW: LABEL_W,
    canvasH: LABEL_H,
    elements: [
      el({
        id: 'sequence',
        kind: 'text',
        name: 'Sequência #N',
        visible: true,
        x: 8,
        y: 4,
        w: 72,
        h: 20,
        fontSize: 18,
        fontWeight: '900',
        labelText: '',
        align: 'left',
      }),
      el({
        id: 'logo',
        kind: 'logo',
        name: 'Logo Rei do ABS',
        visible: true,
        x: 348,
        y: 2,
        w: 30,
        h: 30,
        fontSize: 10,
        labelText: '',
      }),
      el({
        id: 'kind',
        kind: 'text',
        name: 'Tipo',
        visible: true,
        x: 180,
        y: 5,
        w: 162,
        h: 14,
        fontSize: 10,
        fontWeight: 'bold',
        labelText: '',
        align: 'right',
      }),
      el({
        id: 'manufacturer',
        kind: 'text_field',
        name: 'Fabricante',
        visible: true,
        x: 8,
        y: 24,
        w: 368,
        h: 20,
        fontSize: 10,
        fontWeight: 'bold',
        valueFontSize: 16,
        labelText: 'Fab.',
        maxLines: 1,
      }),
      el({
        id: 'app_brand',
        kind: 'text_field',
        name: 'Marca da aplicação',
        visible: true,
        x: 8,
        y: 46,
        w: 368,
        h: 16,
        fontSize: 10,
        fontWeight: 'bold',
        valueFontSize: 12,
        labelText: 'Apl.',
        maxLines: 1,
      }),
      el({
        id: 'app_vehicles',
        kind: 'text_field',
        name: 'Veículos de aplicação',
        visible: true,
        x: 8,
        y: 64,
        w: 368,
        h: 22,
        fontSize: 10,
        fontWeight: 'normal',
        valueFontSize: 12,
        labelText: 'Veíc.',
        maxLines: 2,
      }),
      el({
        id: 'app_years',
        kind: 'text_field',
        name: 'Ano da aplicação',
        visible: true,
        x: 8,
        y: 88,
        w: 368,
        h: 16,
        fontSize: 10,
        fontWeight: 'bold',
        valueFontSize: 12,
        labelText: 'Ano',
        maxLines: 1,
      }),
      el({
        id: 'code_line',
        kind: 'text_field',
        name: 'Código',
        visible: true,
        x: 8,
        y: 106,
        w: 200,
        h: 14,
        fontSize: 10,
        fontWeight: 'bold',
        valueFontSize: 11,
        labelText: 'Cód.',
        maxLines: 1,
      }),
      el({
        id: 'location',
        kind: 'text_field',
        name: 'Local',
        visible: true,
        x: 212,
        y: 106,
        w: 164,
        h: 14,
        fontSize: 10,
        fontWeight: 'bold',
        valueFontSize: 11,
        labelText: 'Local',
        maxLines: 1,
      }),
      el({
        id: 'brand',
        kind: 'text',
        name: 'Marca da oficina',
        visible: false,
        x: 8,
        y: 4,
        w: 120,
        h: 14,
        fontSize: 10,
        labelText: '',
        align: 'left',
      }),
      el({
        id: 'qr',
        kind: 'qr',
        name: 'QR Code',
        /** Etiqueta ABS usa só código de barras (pistola USB). */
        visible: false,
        x: 262,
        y: 60,
        w: 112,
        h: 112,
        fontSize: 12,
        labelText: '',
      }),
      el({
        id: 'barcode',
        kind: 'barcode',
        name: 'Código de barras',
        visible: true,
        x: 8,
        y: 124,
        w: 368,
        h: 74,
        fontSize: 12,
        labelText: '',
      }),
      el({
        id: 'human_code',
        kind: 'human_code',
        name: 'ID legível',
        visible: true,
        x: 8,
        y: 202,
        w: 368,
        h: 28,
        fontSize: 14,
        labelText: '',
        align: 'center',
      }),
    ],
  };
}

export function createDefaultTemplate(id: LabelTemplateId): LabelTemplateLayout {
  if (id === 'estoque') return createDefaultEstoqueTemplate();
  if (id === 'chave') return createDefaultChaveTemplate();
  if (id === 'pecas_os') return createDefaultPecasOsTemplate();
  if (id === 'abs_modulo') return createDefaultAbsModuloTemplate();
  return createDefaultLabOsTemplate();
}

/** Templates com placa Mercosul / keyOptions (chave vertical ou peças paisagem). */
export function labelTemplateUsesKeyOptions(id: LabelTemplateId): boolean {
  return id === 'chave' || id === 'pecas_os';
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

type NormalizeElementBounds = {
  maxX: number;
  maxY: number;
  maxW: number;
  maxH: number;
};

const DEFAULT_ELEMENT_BOUNDS: NormalizeElementBounds = {
  maxX: LABEL_W + 40,
  maxY: LABEL_H + 40,
  maxW: LABEL_W,
  maxH: LABEL_H,
};

/** Chave: coords no bloco vertical (240×384), não na impressão paisagem. */
const CHAVE_ELEMENT_BOUNDS: NormalizeElementBounds = {
  maxX: LABEL_H + 40,
  maxY: LABEL_W + 40,
  maxW: LABEL_H,
  maxH: LABEL_W,
};

function normalizeElement(
  raw: Partial<LabelElementDef>,
  fallback: LabelElementDef,
  bounds: NormalizeElementBounds = DEFAULT_ELEMENT_BOUNDS
): LabelElementDef {
  const opacityRaw = raw.opacity ?? fallback.opacity ?? 100;
  const rotationRaw = raw.rotation ?? fallback.rotation ?? 0;
  let rotation = Math.round(Number(rotationRaw));
  if (!Number.isFinite(rotation)) rotation = 0;
  rotation = ((rotation % 360) + 360) % 360;
  if (rotation > 180) rotation -= 360;
  return {
    id: fallback.id,
    kind: fallback.kind,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallback.name,
    visible: typeof raw.visible === 'boolean' ? raw.visible : fallback.visible,
    x: clamp(Math.round(Number(raw.x ?? fallback.x)), -40, bounds.maxX),
    y: clamp(Math.round(Number(raw.y ?? fallback.y)), -40, bounds.maxY),
    w: clamp(Math.round(Number(raw.w ?? fallback.w)), 8, bounds.maxW),
    h: clamp(Math.round(Number(raw.h ?? fallback.h)), 8, bounds.maxH),
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
    opacity: clamp(Math.round(Number(opacityRaw)), 0, 100),
    rotation,
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
    dualCopy:
      typeof src.dualCopy === 'boolean' ? src.dualCopy : fallback.dualCopy !== false,
    offsetX: clamp(Math.round(Number(src.offsetX ?? fallback.offsetX)), -40, 40),
    offsetY: clamp(Math.round(Number(src.offsetY ?? fallback.offsetY)), -40, 40),
    mercosulPlate: (src.mercosulPlate ?? fallback.mercosulPlate) !== false,
  };
}

function normalizePecasSidebarIcon(v: unknown): LabelPecasSidebarIcon {
  return LABEL_PECAS_SIDEBAR_ICONS.some((i) => i.value === v)
    ? (v as LabelPecasSidebarIcon)
    : 'car_gear';
}

export function normalizePecasOptions(
  raw: Partial<LabelPecasOptions> | undefined,
  fallback: LabelPecasOptions = createDefaultPecasOptions()
): LabelPecasOptions {
  const src = raw ?? {};
  return {
    sidebarWidth: clamp(Math.round(Number(src.sidebarWidth ?? fallback.sidebarWidth)), 40, 140),
    sidebarText:
      typeof src.sidebarText === 'string' && src.sidebarText.trim()
        ? src.sidebarText.trim().slice(0, 12)
        : fallback.sidebarText,
    sidebarTextSize: clamp(
      Math.round(Number(src.sidebarTextSize ?? fallback.sidebarTextSize)),
      10,
      48
    ),
    sidebarIcon: normalizePecasSidebarIcon(src.sidebarIcon ?? fallback.sidebarIcon),
    sidebarIconSize: clamp(
      Math.round(Number(src.sidebarIconSize ?? fallback.sidebarIconSize)),
      0,
      72
    ),
    showSidebarBar:
      typeof src.showSidebarBar === 'boolean'
        ? src.showSidebarBar
        : fallback.showSidebarBar !== false,
    showPlateIcon:
      typeof src.showPlateIcon === 'boolean'
        ? src.showPlateIcon
        : fallback.showPlateIcon !== false,
    showColorIcon:
      typeof src.showColorIcon === 'boolean'
        ? src.showColorIcon
        : fallback.showColorIcon !== false,
    showCustomerIcon:
      typeof src.showCustomerIcon === 'boolean'
        ? src.showCustomerIcon
        : fallback.showCustomerIcon !== false,
    fieldIconSize: clamp(
      Math.round(Number(src.fieldIconSize ?? fallback.fieldIconSize)),
      12,
      36
    ),
  };
}

export function normalizeLabelTemplate(
  id: LabelTemplateId,
  raw: Partial<LabelTemplateLayout> | null | undefined
): LabelTemplateLayout {
  const def = createDefaultTemplate(id);
  const bounds = id === 'chave' ? CHAVE_ELEMENT_BOUNDS : DEFAULT_ELEMENT_BOUNDS;
  const byId = new Map((raw?.elements ?? []).map((e) => [e.id, e]));
  let elements = def.elements.map((fallback) =>
    normalizeElement(byId.get(fallback.id) ?? {}, fallback, bounds)
  );
  // Elementos extras salvos (futuras etiquetas) — preserva se tiverem id/kind
  for (const extra of raw?.elements ?? []) {
    if (!extra?.id || elements.some((e) => e.id === extra.id)) continue;
    if (!extra.kind) continue;
    elements.push(
      normalizeElement(
        extra,
        {
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
        },
        bounds
      )
    );
  }

  // Chave: placa sem rótulo "Placa:" e nome amigável estável.
  if (id === 'chave') {
    elements = elements.map((e) =>
      e.id === 'plate' ? { ...e, labelText: '', name: 'Placa' } : e
    );
  }

  // Peças: garante campos do mockup; v1/v2 → v3 traz pecasOptions editáveis.
  if (id === 'pecas_os') {
    const savedVersion = Number(raw?.version ?? 0);
    if (savedVersion > 0 && savedVersion < 2) {
      elements = def.elements.map((fb) => ({ ...fb }));
    } else {
      for (const fb of def.elements) {
        if (elements.some((e) => e.id === fb.id)) continue;
        elements.push({ ...fb });
      }
      elements = elements.map((e) => {
        if (e.id === 'plate') return { ...e, name: 'Placa' };
        if (e.id === 'customer') return { ...e, name: 'Cliente' };
        if (e.id === 'vehicle') return { ...e, name: 'Veículo' };
        if (e.id === 'color') return { ...e, name: 'Cor' };
        return e;
      });
    }
  }

  // ABS: só código de barras (sem QR).
  // v1/v2 → v3: remapeia geometria (introdução Fab/Apl/Veíc).
  // v3+ → v5+: NÃO remapeia posições customizadas — só adiciona campos novos (Ano, logo).
  if (id === 'abs_modulo') {
    const savedVersion = Number(raw?.version ?? 0);
    const remapGeometry = savedVersion > 0 && savedVersion < 3;
    elements = elements.map((e) => {
      if (e.id === 'qr') return { ...e, visible: false };
      if (e.id === 'brand' && remapGeometry) {
        const fb = def.elements.find((d) => d.id === e.id);
        return fb ? { ...fb } : { ...e, visible: false };
      }
      if (!remapGeometry) return e;
      const fb = def.elements.find((d) => d.id === e.id);
      if (!fb) return e;
      return {
        ...e,
        x: fb.x,
        y: fb.y,
        w: fb.w,
        h: fb.h,
        fontSize: fb.fontSize,
        valueFontSize: fb.valueFontSize,
        fontWeight: fb.fontWeight,
        labelText: fb.labelText,
        align: fb.align,
        maxLines: fb.maxLines,
        visible: fb.visible,
      };
    });
    // Garante elementos novos (manufacturer / app_* / app_years) mesmo em saves antigos.
    for (const fb of def.elements) {
      if (elements.some((e) => e.id === fb.id)) continue;
      elements.push({ ...fb });
    }
  }

  // Chave v1 → v2: placa passa a ser caixa Mercosul (geometria padrão da placa).
  // Chave v2 → v3: rótulos Cliente/Carro/Cor viram ícones 👤/🚗/🎨 (só se ainda forem o texto clássico).
  if (id === 'chave') {
    const savedVersion = Number(raw?.version ?? 0);
    if (savedVersion > 0 && savedVersion < 2) {
      elements = elements.map((e) => {
        if (e.id !== 'plate') return e;
        const fb = def.elements.find((d) => d.id === 'plate');
        if (!fb) return e;
        return {
          ...e,
          x: fb.x,
          y: fb.y,
          w: fb.w,
          h: fb.h,
          fontSize: fb.fontSize,
          valueFontSize: fb.valueFontSize,
          labelText: '',
          align: 'center',
          name: fb.name,
        };
      });
    }
    if (savedVersion > 0 && savedVersion < 3) {
      const classicToIcon: Record<string, string> = {
        customer: '👤 ',
        vehicle: '🚗 ',
        color: '🎨 ',
      };
      const classicLabels = new Set([
        'Cliente:',
        'Cliente',
        'Carro:',
        'Carro',
        'Cor:',
        'Cor',
        'Veículo:',
        'Veículo',
      ]);
      elements = elements.map((e) => {
        const next = classicToIcon[e.id];
        if (!next) return e;
        const t = (e.labelText || '').trim();
        if (!t || classicLabels.has(t)) {
          return { ...e, labelText: next };
        }
        return e;
      });
    }
  }

  return {
    id,
    // Mantém a versão salva se já for >= padrão; senão sobe para o default atual.
    version:
      id === 'abs_modulo'
        ? Math.max(Number(raw?.version) || 0, Number(def.version) || 5)
        : id === 'chave'
          ? Math.max(Number(raw?.version) || 0, Number(def.version) || 4)
          : id === 'pecas_os'
            ? Math.max(Number(raw?.version) || 0, Number(def.version) || 3)
            : 1,
    canvasW: LABEL_W,
    canvasH: LABEL_H,
    elements,
    keyOptions:
      id === 'chave' || id === 'pecas_os'
        ? normalizeKeyOptions(raw?.keyOptions, def.keyOptions!)
        : undefined,
    pecasOptions:
      id === 'pecas_os'
        ? normalizePecasOptions(raw?.pecasOptions, def.pecasOptions ?? createDefaultPecasOptions())
        : undefined,
    chaveSvgOptions:
      id === 'chave'
        ? normalizeChaveSvgOptions(
            raw?.chaveSvgOptions,
            def.chaveSvgOptions ?? createDefaultChaveSvgOptions()
          )
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
        mercosulPlate: true,
      },
    });
  } catch {
    return null;
  }
}

export function createDefaultLabelTemplatesStore(): LabelTemplatesStore {
  return {
    lab_os: createDefaultLabOsTemplate(),
    estoque: createDefaultEstoqueTemplate(),
    chave: createDefaultChaveTemplate(),
    pecas_os: createDefaultPecasOsTemplate(),
    abs_modulo: createDefaultAbsModuloTemplate(),
  };
}

/** Normaliza um store parcial (localStorage / API) para o formato canônico. */
export function normalizeLabelTemplatesStore(
  raw: Partial<Record<LabelTemplateId, Partial<LabelTemplateLayout>>> | null | undefined
): LabelTemplatesStore {
  const parsed = raw && typeof raw === 'object' ? raw : {};
  return {
    lab_os: normalizeLabelTemplate('lab_os', parsed.lab_os),
    estoque: normalizeLabelTemplate('estoque', parsed.estoque),
    chave: normalizeLabelTemplate('chave', parsed.chave),
    pecas_os: normalizeLabelTemplate('pecas_os', parsed.pecas_os),
    abs_modulo: normalizeLabelTemplate('abs_modulo', parsed.abs_modulo),
  };
}

/** True se este dispositivo já tem templates salvos localmente (edições do usuário). */
export function hasLocalLabelTemplates(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY)?.trim());
  } catch {
    return false;
  }
}

export function loadAllLabelTemplates(): LabelTemplatesStore {
  const defaults = createDefaultLabelTemplatesStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<LabelTemplateId, Partial<LabelTemplateLayout>>>;
      return normalizeLabelTemplatesStore(parsed);
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
  const next = normalizeLabelTemplatesStore(store);
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
    oficinaShelf: null,
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
  pecas_os: {
    vehicleModel: 'HR-V EXL 1.8 FLEX',
    vehicleColor: 'BRANCO',
    plate: 'AZK4B21',
    customerName: 'Fernando Almeida',
    vehicleYear: '2016',
  },
  abs_modulo: {
    brand: 'REI DO ABS',
    sequenceNumber: 12,
    publicId: 'ABS-000012',
    moduleKind: 'completo',
    manufacturer: 'Bosch',
    applicationBrand: 'Volkswagen',
    applicationVehicles: 'Gol · Fox · Voyage · Saveiro',
    applicationYears: '2010–2018',
    code: '0265231548',
    location: 'Prateleira B3',
  },
} as const;
