/**
 * Cliente modular SEFAZ / NF-e (Distribuição DF-e / download XML).
 *
 * A consulta nunca deve ser feita no frontend. Credenciais ficam só no servidor.
 * A assinatura SOAP + mTLS com certificado A1 pode ser plugada aqui sem mudar a API.
 */

import {
  loadNfeSefazConfig,
  nfeSefazCertificateConfigured,
  nfeSefazSetupChecklist,
  type NfeSefazConfig,
} from './sefazConfig.js';

export class NfeSefazNotConfiguredError extends Error {
  readonly code = 'NFE_SEFAZ_NOT_CONFIGURED';
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      'Integração SEFAZ/NF-e ainda não configurada no servidor. ' +
        'Configure o certificado digital A1 e as variáveis de ambiente.'
    );
    this.name = 'NfeSefazNotConfiguredError';
    this.missing = missing;
  }
}

export class NfeSefazNotImplementedError extends Error {
  readonly code = 'NFE_SEFAZ_NOT_IMPLEMENTED';

  constructor(message?: string) {
    super(
      message ||
        'Cliente SEFAZ preparado, mas a chamada DistDFe/download XML ainda precisa ser habilitada com o certificado A1 no servidor.'
    );
    this.name = 'NfeSefazNotImplementedError';
  }
}

export type NfeXmlFetchResult = {
  xml: string;
  source: 'sefaz' | 'xml_body';
};

export type NfeSefazClient = {
  isCertificateReady(): boolean;
  setupChecklist(): string[];
  /**
   * Obtém o XML da NF-e pela chave de acesso via web service SEFAZ (DistDFeInt / NFeDistribuicaoDFe).
   */
  fetchXmlByAccessKey(accessKey: string): Promise<NfeXmlFetchResult>;
};

/**
 * Implementação base: valida configuração e deixa o ponto de extensão pronto.
 * Quando o PFX estiver disponível, completar `callDistDfeDownload`.
 */
export function createNfeSefazClient(config: NfeSefazConfig = loadNfeSefazConfig()): NfeSefazClient {
  return {
    isCertificateReady() {
      return nfeSefazCertificateConfigured(config);
    },
    setupChecklist() {
      return nfeSefazSetupChecklist(config);
    },
    async fetchXmlByAccessKey(accessKey: string): Promise<NfeXmlFetchResult> {
      const key = String(accessKey || '').replace(/\D/g, '');
      if (key.length !== 44) {
        throw new Error('Chave de acesso inválida para consulta SEFAZ.');
      }

      const missing = nfeSefazSetupChecklist(config);
      if (missing.length > 0 || !nfeSefazCertificateConfigured(config)) {
        throw new NfeSefazNotConfiguredError(missing.length ? missing : nfeSefazSetupChecklist(config));
      }

      // Ponto de extensão: assinar SOAP NFeDistribuicaoDFe com o A1 e baixar o doc ZIP/XML.
      // Mantido explícito para não fingir consulta bem-sucedida sem certificado operacional.
      throw new NfeSefazNotImplementedError(
        `Certificado detectado (${config.environment}, UF=${config.uf || '—'}), ` +
          'porém a chamada DistDFe ainda não está ativada neste ambiente. ' +
          'Use NFE_ALLOW_XML_BODY_IMPORT=true e envie o XML oficial no body enquanto finalizamos o cliente SOAP, ' +
          'ou complete services/nfe/sefazClient.ts com a integração DistDFe.'
      );
    },
  };
}

export const nfeSefazClient = createNfeSefazClient();
