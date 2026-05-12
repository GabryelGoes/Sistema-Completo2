/** Impressão / Salvar como PDF — esconde barras do modal e usa folha em A4. */
export const DIAGNOSTIC_AUTHORIZATION_PRINT_CSS = `
@media print {
  .diag-auth-sheet-no-print { display: none !important; }
  .diag-auth-sheet-backdrop { background: white !important; }
  .diag-auth-sheet-paper { box-shadow: none !important; margin: 0 auto !important; max-width: 100% !important; }
  @page { size: A4; margin: 14mm; }
}
`;
