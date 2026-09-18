/** Extração de dados fiscais a partir do XML da NF-e (sem dependências externas). */

export type ParsedNfeProduct = {
  lineNumber: number;
  productCode: string | null;
  ean: string | null;
  description: string;
  ncm: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type ParsedNfeDocument = {
  accessKey: string;
  number: string | null;
  series: string | null;
  issuedAt: string | null;
  supplierCnpj: string | null;
  supplierName: string | null;
  totalAmount: number | null;
  products: ParsedNfeProduct[];
};

function decodeXmlEntities(value: string): string {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tagValue(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  const raw = decodeXmlEntities(m[1]).trim();
  return raw || null;
}

function tagNumber(xml: string, tag: string): number | null {
  const raw = tagValue(xml, tag);
  if (raw == null) return null;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normalizeEan(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return null;
  // SEM GTIN / valores placeholder da SEFAZ
  if (/^(SEM\s*GTIN|N[AÃ]O\s*INFORMADO)$/i.test(String(raw).trim())) return null;
  return digits;
}

function extractInfNfeBlock(xml: string): string {
  const m = xml.match(/<infNFe\b[\s\S]*?<\/infNFe>/i);
  return m ? m[0] : xml;
}

function extractAccessKeyFromXml(xml: string): string | null {
  const inf = xml.match(/<infNFe\b[^>]*\bId\s*=\s*["']NFe(\d{44})["']/i);
  if (inf?.[1]) return inf[1];
  const chNFe = tagValue(xml, 'chNFe');
  if (chNFe && /^\d{44}$/.test(chNFe.replace(/\D/g, ''))) {
    return chNFe.replace(/\D/g, '');
  }
  const prot = tagValue(xml, 'chNFe');
  if (prot) {
    const d = prot.replace(/\D/g, '');
    if (d.length === 44) return d;
  }
  return null;
}

function extractEmitBlock(inf: string): string {
  const m = inf.match(/<emit\b[\s\S]*?<\/emit>/i);
  return m ? m[0] : '';
}

function extractIdeBlock(inf: string): string {
  const m = inf.match(/<ide\b[\s\S]*?<\/ide>/i);
  return m ? m[0] : '';
}

function extractTotalBlock(inf: string): string {
  const m = inf.match(/<total\b[\s\S]*?<\/total>/i);
  return m ? m[0] : '';
}

function parseDetProducts(inf: string): ParsedNfeProduct[] {
  const products: ParsedNfeProduct[] = [];
  const detRe = /<det\b([^>]*)>([\s\S]*?)<\/det>/gi;
  let match: RegExpExecArray | null;
  let fallbackLine = 0;
  while ((match = detRe.exec(inf)) !== null) {
    fallbackLine += 1;
    const attrs = match[1] || '';
    const body = match[2] || '';
    const nItemAttr = attrs.match(/\bnItem\s*=\s*["'](\d+)["']/i);
    const lineNumber = nItemAttr ? Number(nItemAttr[1]) : fallbackLine;
    const prod = body.match(/<prod\b[\s\S]*?<\/prod>/i)?.[0] || body;

    const ean =
      normalizeEan(tagValue(prod, 'cEANTrib')) ||
      normalizeEan(tagValue(prod, 'cEAN')) ||
      null;

    const quantity =
      tagNumber(prod, 'qCom') ??
      tagNumber(prod, 'qTrib') ??
      0;
    const unitPrice =
      tagNumber(prod, 'vUnCom') ??
      tagNumber(prod, 'vUnTrib') ??
      0;
    const totalPrice = tagNumber(prod, 'vProd') ?? Number((quantity * unitPrice).toFixed(2));

    products.push({
      lineNumber: Number.isFinite(lineNumber) && lineNumber > 0 ? lineNumber : fallbackLine,
      productCode: tagValue(prod, 'cProd'),
      ean,
      description: tagValue(prod, 'xProd') || `Item ${lineNumber}`,
      ncm: tagValue(prod, 'NCM'),
      unit: tagValue(prod, 'uCom') || tagValue(prod, 'uTrib') || 'UN',
      quantity: Math.round(Math.max(0, quantity) * 1000) / 1000,
      unitPrice: Math.round(Math.max(0, unitPrice) * 10000) / 10000,
      totalPrice: Math.round(Math.max(0, totalPrice) * 100) / 100,
    });
  }
  return products.filter((p) => p.quantity > 0);
}

/**
 * Interpreta XML de NF-e (procNFe / nfeProc / NFe).
 * Lança erro se o XML não tiver estrutura mínima de NF-e.
 */
export function parseNfeXml(xmlRaw: string): ParsedNfeDocument {
  const xml = String(xmlRaw ?? '').trim();
  if (!xml || !/<NFe\b|<nfeProc\b|<procNFe\b|<infNFe\b/i.test(xml)) {
    throw new Error('XML inválido: não parece ser uma NF-e.');
  }

  const inf = extractInfNfeBlock(xml);
  const ide = extractIdeBlock(inf);
  const emit = extractEmitBlock(inf);
  const total = extractTotalBlock(inf);

  const accessKey = extractAccessKeyFromXml(xml) || extractAccessKeyFromXml(inf);
  if (!accessKey || accessKey.length !== 44) {
    throw new Error('Não foi possível extrair a chave de acesso (44 dígitos) do XML.');
  }

  const mod = tagValue(ide, 'mod');
  if (mod && mod !== '55') {
    throw new Error(`XML não é NF-e modelo 55 (mod=${mod}).`);
  }

  const dhEmi = tagValue(ide, 'dhEmi') || tagValue(ide, 'dEmi');
  let issuedAt: string | null = null;
  if (dhEmi) {
    const d = new Date(dhEmi);
    issuedAt = Number.isNaN(d.getTime()) ? dhEmi : d.toISOString();
  }

  const supplierCnpj =
    tagValue(emit, 'CNPJ') ||
    tagValue(emit, 'CPF') ||
    null;

  const products = parseDetProducts(inf);
  if (products.length === 0) {
    throw new Error('A NF-e não possui itens de produto (det/prod).');
  }

  const totalAmount =
    tagNumber(total, 'vNF') ??
    products.reduce((acc, p) => acc + p.totalPrice, 0);

  return {
    accessKey,
    number: tagValue(ide, 'nNF'),
    series: tagValue(ide, 'serie'),
    issuedAt,
    supplierCnpj: supplierCnpj ? supplierCnpj.replace(/\D/g, '') : null,
    supplierName: tagValue(emit, 'xNome') || tagValue(emit, 'xFant'),
    totalAmount: totalAmount != null ? Math.round(totalAmount * 100) / 100 : null,
    products,
  };
}
