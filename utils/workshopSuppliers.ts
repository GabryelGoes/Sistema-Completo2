/** Cadastro de fornecedores do estoque. */

export type WorkshopSupplier = {
  id: string;
  workshop_id?: string;
  name: string;
  trade_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  contact_name: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
};

export type WorkshopSupplierWriteInput = {
  name: string;
  trade_name?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  contact_name?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  notes?: string | null;
  active?: boolean;
};

export function normalizeSupplierDocument(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function formatSupplierDocument(raw: string | null | undefined): string {
  const d = normalizeSupplierDocument(raw);
  if (!d) return '';
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return d;
}

export function supplierDisplayName(s: Pick<WorkshopSupplier, 'name' | 'trade_name'>): string {
  const name = (s.name || '').trim();
  const trade = (s.trade_name || '').trim();
  if (name && trade && trade.toLowerCase() !== name.toLowerCase()) {
    return `${name} (${trade})`;
  }
  return name || trade || 'Fornecedor';
}

export function supplierSearchHaystack(s: WorkshopSupplier): string {
  return [
    s.name,
    s.trade_name,
    s.document,
    s.email,
    s.phone,
    s.whatsapp,
    s.contact_name,
    s.address_city,
    s.address_state,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('pt-BR');
}

export function filterSuppliers(
  list: WorkshopSupplier[],
  query: string,
  opts?: { activeOnly?: boolean }
): WorkshopSupplier[] {
  let rows = list;
  if (opts?.activeOnly !== false) {
    rows = rows.filter((s) => s.active !== false);
  }
  const q = query.trim().toLocaleLowerCase('pt-BR');
  if (!q) return rows;
  return rows.filter((s) => supplierSearchHaystack(s).includes(q));
}
