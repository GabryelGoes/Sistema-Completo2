/**
 * Orquestração de entrada por NF-e: matching de produtos e payloads de API.
 */

import { normalizeBarcodeInput } from '../../utils/workshopPartBarcode.js';
import type { ParsedNfeDocument, ParsedNfeProduct } from '../../utils/nfeXmlParse.js';

export type NfeMatchPartSnapshot = {
  id: string;
  name: string;
  barcode?: string | null;
  original_code?: string | null;
  numeric_code?: string | null;
  stock_qty?: number | null;
  unit_of_measure?: string | null;
  unit_cost?: number | null;
  ncm_code?: string | null;
};

export type NfeProductMatch = {
  part: NfeMatchPartSnapshot | null;
  matchMethod: 'ean' | 'product_code' | null;
};

function normCode(value: string | null | undefined): string {
  return normalizeBarcodeInput(String(value ?? ''));
}

/** Prioridade: EAN/GTIN (barcode) → código do fornecedor (original_code / numeric_code / barcode). */
export function matchNfeProductToPart(
  product: ParsedNfeProduct,
  parts: NfeMatchPartSnapshot[]
): NfeProductMatch {
  const ean = normCode(product.ean);
  if (ean) {
    const byEan = parts.find((p) => normCode(p.barcode) === ean);
    if (byEan) return { part: byEan, matchMethod: 'ean' };
  }

  const code = normCode(product.productCode);
  if (code) {
    const byCode = parts.find(
      (p) =>
        normCode(p.barcode) === code ||
        normCode(p.original_code) === code ||
        normCode(p.numeric_code) === code
    );
    if (byCode) return { part: byCode, matchMethod: 'product_code' };
  }

  return { part: null, matchMethod: null };
}

export function buildNfeLookupItems(
  doc: ParsedNfeDocument,
  parts: NfeMatchPartSnapshot[],
  persisted?: Array<{
    id: string;
    line_number: number;
    part_id?: string | null;
    selected?: boolean | null;
  }>
) {
  return doc.products.map((product) => {
    const auto = matchNfeProductToPart(product, parts);
    const row = persisted?.find((p) => p.line_number === product.lineNumber);
    const linked =
      (row?.part_id && parts.find((p) => p.id === row.part_id)) || auto.part || null;

    return {
      line_number: product.lineNumber,
      product_code: product.productCode,
      ean: product.ean,
      description: product.description,
      ncm: product.ncm,
      unit: product.unit,
      quantity: product.quantity,
      unit_price: product.unitPrice,
      total_price: product.totalPrice,
      item_id: row?.id ?? null,
      selected: row?.selected ?? true,
      matched_part_id: linked?.id ?? null,
      matched_part_name: linked?.name ?? null,
      match_method: linked
        ? row?.part_id
          ? ('manual' as const)
          : auto.matchMethod
        : null,
      needs_mapping: !linked,
    };
  });
}

export function nfeEntryPublicPayload(entry: Record<string, unknown>, items: ReturnType<typeof buildNfeLookupItems>) {
  return {
    entry_id: entry.id,
    access_key: entry.access_key,
    status: entry.status,
    nfe_number: entry.nfe_number ?? null,
    nfe_series: entry.nfe_series ?? null,
    issued_at: entry.issued_at ?? null,
    supplier_cnpj: entry.supplier_cnpj ?? null,
    supplier_name: entry.supplier_name ?? null,
    total_amount: entry.total_amount != null ? Number(entry.total_amount) : null,
    confirmed_at: entry.confirmed_at ?? null,
    confirmed_by_name: entry.confirmed_by_name ?? null,
    created_at: entry.created_at ?? null,
    items,
    items_total: items.length,
    items_selected: items.filter((i) => i.selected).length,
  };
}
