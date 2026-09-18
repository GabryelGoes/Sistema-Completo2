/**
 * Configuração da integração NF-e / SEFAZ (somente backend).
 * Nunca exponha certificado, senha ou chave privada ao frontend.
 */

export type NfeSefazEnvironment = 'homologacao' | 'producao';

export type NfeSefazConfig = {
  environment: NfeSefazEnvironment;
  /** UF do emitente (ex.: SP) — usada para endpoint do web service. */
  uf: string | null;
  /** CNPJ do destinatário/interesse (empresa da oficina), só dígitos. */
  cnpjInterest: string | null;
  /** Caminho absoluto/relativo do arquivo PFX/P12 no servidor. */
  certPfxPath: string | null;
  /** Conteúdo PFX em Base64 (alternativa ao path). */
  certPfxBase64: string | null;
  /** Senha do certificado A1 — apenas env do servidor. */
  certPassword: string | null;
  /**
   * Quando true, o endpoint de lookup aceita XML colado/enviado no body
   * (XML real obtido no portal da SEFAZ). Útil antes do certificado estar pronto.
   */
  allowXmlBodyImport: boolean;
};

function envFlag(name: string, fallback = false): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function loadNfeSefazConfig(): NfeSefazConfig {
  const envRaw = String(process.env.NFE_SEFAZ_ENVIRONMENT || process.env.NFE_ENVIRONMENT || 'homologacao')
    .trim()
    .toLowerCase();
  const environment: NfeSefazEnvironment =
    envRaw === 'producao' || envRaw === 'production' || envRaw === 'prod'
      ? 'producao'
      : 'homologacao';

  const certPassword = process.env.NFE_CERT_PASSWORD?.trim() || null;
  const certPfxPath = process.env.NFE_CERT_PFX_PATH?.trim() || null;
  const certPfxBase64 = process.env.NFE_CERT_PFX_BASE64?.trim() || null;

  return {
    environment,
    uf: process.env.NFE_UF?.trim().toUpperCase() || null,
    cnpjInterest: (process.env.NFE_CNPJ || process.env.NFE_CNPJ_INTERESSADO || '')
      .replace(/\D/g, '') || null,
    certPfxPath,
    certPfxBase64,
    certPassword,
    allowXmlBodyImport: envFlag('NFE_ALLOW_XML_BODY_IMPORT', true),
  };
}

export function nfeSefazCertificateConfigured(config: NfeSefazConfig = loadNfeSefazConfig()): boolean {
  const hasMaterial = !!(config.certPfxPath || config.certPfxBase64);
  return hasMaterial && !!config.certPassword;
}

export function nfeSefazSetupChecklist(config: NfeSefazConfig = loadNfeSefazConfig()): string[] {
  const missing: string[] = [];
  if (!config.certPfxPath && !config.certPfxBase64) {
    missing.push('NFE_CERT_PFX_PATH ou NFE_CERT_PFX_BASE64 (certificado A1 .pfx no servidor)');
  }
  if (!config.certPassword) {
    missing.push('NFE_CERT_PASSWORD (senha do certificado A1)');
  }
  if (!config.uf) {
    missing.push('NFE_UF (UF da empresa, ex.: SP)');
  }
  if (!config.cnpjInterest || config.cnpjInterest.length !== 14) {
    missing.push('NFE_CNPJ (CNPJ da oficina/interessado, 14 dígitos)');
  }
  return missing;
}
