import type { ExternalRepair } from '../constants/labBench';
import { labProductDisplayLabel, parseModuleKind } from './moduleMetadata';

export type ExternalRepairDraft = {
  vehicleRef: string;
  productIdentification: string;
  productType: string;
  productTypeOther: string;
  service: string;
  vendor: string;
  sentAt: string;
  expectedAt: string;
  returnedAt: string;
  cost: string;
  notes: string;
};

export const EMPTY_EXTERNAL_REPAIR_DRAFT: ExternalRepairDraft = {
  vehicleRef: '',
  productIdentification: '',
  productType: '',
  productTypeOther: '',
  service: '',
  vendor: '',
  sentAt: '',
  expectedAt: '',
  returnedAt: '',
  cost: '',
  notes: '',
};

/** Extrai o rótulo do serviço encaminhado do pátio (vínculos ou issue_description). */
export function extractPatioServiceLabel(detail: {
  issue_description?: string | null;
  lab_service_links?: unknown;
}): string {
  const links = detail.lab_service_links;
  if (Array.isArray(links) && links.length > 0) {
    const label = String((links[0] as { serviceLabel?: string })?.serviceLabel ?? '').trim();
    if (label) return label;
  }
  const issue = String(detail.issue_description ?? '').trim();
  const m = issue.match(/Serviço enviado do pátio \(OS #[^)]+\):\s*(.+?)(?:\n|$)/i);
  if (m?.[1]) return m[1].trim();
  return '';
}

function pickExternalRepairText(
  primary: string | null | undefined,
  fallback: string | null | undefined
): string {
  const p = String(primary ?? '').trim();
  if (p) return p;
  return String(fallback ?? '').trim();
}

export function buildExternalRepairDraft(
  detail: {
    vehicle_model?: string | null;
    module_identification?: string | null;
    module_kind?: string | null;
    module_product_other?: string | null;
    issue_description?: string | null;
    lab_service_links?: unknown;
    external_repair?: ExternalRepair | null;
  } | null,
  fallbackExternalRepair?: ExternalRepair | null
): ExternalRepairDraft {
  if (!detail) return { ...EMPTY_EXTERNAL_REPAIR_DRAFT };
  const er = detail.external_repair ?? null;
  const fb = fallbackExternalRepair ?? null;
  const patioService = extractPatioServiceLabel(detail);
  return {
    vehicleRef:
      pickExternalRepairText(er?.vehicleRef, fb?.vehicleRef) || (detail.vehicle_model ?? '').trim(),
    productIdentification:
      pickExternalRepairText(er?.productIdentification, fb?.productIdentification) ||
      (detail.module_identification ?? '').trim(),
    productType:
      pickExternalRepairText(er?.productType, fb?.productType) ||
      parseModuleKind(detail.module_kind) ||
      '',
    productTypeOther:
      pickExternalRepairText(er?.productTypeOther, fb?.productTypeOther) ||
      (detail.module_product_other ?? '').trim(),
    service: pickExternalRepairText(er?.service, fb?.service) || patioService,
    vendor: pickExternalRepairText(er?.vendor, fb?.vendor),
    sentAt: pickExternalRepairText(er?.sentAt, fb?.sentAt),
    expectedAt: pickExternalRepairText(er?.expectedAt, fb?.expectedAt),
    returnedAt: pickExternalRepairText(er?.returnedAt, fb?.returnedAt),
    cost: pickExternalRepairText(er?.cost, fb?.cost),
    notes: pickExternalRepairText(er?.notes, fb?.notes),
  };
}

export function draftToExternalRepairPayload(d: ExternalRepairDraft): ExternalRepair | null {
  const hasAny = [
    d.vehicleRef,
    d.productIdentification,
    d.productType,
    d.productTypeOther,
    d.service,
    d.vendor,
    d.sentAt,
    d.expectedAt,
    d.returnedAt,
    d.cost,
    d.notes,
  ].some((v) => v.trim() !== '');
  if (!hasAny) return null;
  return {
    vehicleRef: d.vehicleRef.trim() || null,
    productIdentification: d.productIdentification.trim() || null,
    productType: d.productType.trim() || null,
    productTypeOther: d.productType === 'outro' ? d.productTypeOther.trim() || null : null,
    service: d.service.trim() || null,
    vendor: d.vendor.trim() || null,
    sentAt: d.sentAt.trim() || null,
    expectedAt: d.expectedAt.trim() || null,
    returnedAt: d.returnedAt.trim() || null,
    cost: d.cost.trim() || null,
    notes: d.notes.trim() || null,
  };
}

export function externalRepairProductTypeLabel(er: ExternalRepair | null | undefined): string {
  if (!er?.productType?.trim()) return '—';
  return labProductDisplayLabel(er.productType, er.productTypeOther);
}

export function formatExternalRepairDate(value?: string | null): string {
  if (!value) return '—';
  const v = String(value).trim();
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return v;
}
