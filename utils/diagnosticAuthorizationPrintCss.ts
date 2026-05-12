/** CSS compartilhado: impressão / Salvar como PDF (Caixa de diálogo do sistema). */
export const DIAGNOSTIC_AUTHORIZATION_PRINT_CSS = `
@media print {
  .diag-auth-cert-no-print { display: none !important; }
  .diag-auth-cert-backdrop { background: white !important; }
  .diag-auth-print-root { box-shadow: none !important; margin: 0 auto !important; max-width: 100% !important; }
  @page { size: A4; margin: 14mm; }
}
`;
