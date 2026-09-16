/** Monta/interpreta o texto persistido em `notes` das movimentações de estoque. */

export type SaleMovementDetails = {
  customerName?: string;
  invoiceRef?: string;
  paymentMethod?: string;
  notes?: string;
};

export type ConsumableMovementDetails = {
  osScope?: 'patio' | 'lab' | '';
  osLabel?: string;
  withdrawnBy?: string;
  notes?: string;
};

function pushLine(lines: string[], label: string, value: string | undefined | null) {
  const v = String(value ?? '').trim();
  if (!v) return;
  lines.push(`${label}: ${v}`);
}

export function formatSaleMovementNotes(details: SaleMovementDetails): string | null {
  const lines: string[] = [];
  pushLine(lines, 'Cliente', details.customerName);
  pushLine(lines, 'NF/Doc', details.invoiceRef);
  pushLine(lines, 'Pagamento', details.paymentMethod);
  pushLine(lines, 'Obs', details.notes);
  return lines.length ? lines.join('\n') : null;
}

export function formatConsumableMovementNotes(details: ConsumableMovementDetails): string | null {
  const lines: string[] = [];
  if (details.osScope === 'patio') pushLine(lines, 'Origem', 'Pátio');
  if (details.osScope === 'lab') pushLine(lines, 'Origem', 'Laboratório');
  pushLine(lines, 'OS', details.osLabel);
  pushLine(lines, 'Retirado por', details.withdrawnBy);
  pushLine(lines, 'Obs', details.notes);
  return lines.length ? lines.join('\n') : null;
}

/** Compra em andamento (ainda não recebida). */
export function isPurchaseInProgress(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'ordered';
}

export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  ordered: 'Pedido emitido',
  received: 'Recebido',
  cancelled: 'Cancelado',
};

/** Texto profissional para o banner do scan quando há compra aberta. */
export function purchasePipelineBannerText(statuses: string[]): string | null {
  const active = statuses.filter(isPurchaseInProgress);
  if (active.length === 0) return null;
  const hasOrdered = active.includes('ordered');
  const hasPending = active.includes('pending');
  if (hasOrdered && hasPending) {
    return 'Reposição em andamento — há solicitação e pedido junto ao fornecedor.';
  }
  if (hasOrdered) {
    return 'Reposição em andamento — pedido emitido ao fornecedor.';
  }
  return 'Reposição em andamento — solicitação de compra aberta.';
}
