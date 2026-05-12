/** Título exibido no cabeçalho da UI e do modal folha. */
export const DIAGNOSTIC_AUTHORIZATION_TITLE = "AUTORIZAÇÃO DE DIAGNÓSTICO TÉCNICO";

/** Trecho do termo; `callout` = destaque visual (negrito + caixa alta na UI). */
export type DiagnosticAuthorizationTextChunk = {
  readonly text: string;
  readonly callout?: boolean;
};

/**
 * Mesmo texto legal, segmentado para destaque dos pontos financeiros e condições.
 * A junção dos `text` reproduz {@link DIAGNOSTIC_AUTHORIZATION_PARAGRAPHS}.
 */
export const DIAGNOSTIC_AUTHORIZATION_PARAGRAPH_CHUNKS: readonly (readonly DiagnosticAuthorizationTextChunk[])[] = [
  [
    { text: "Autorizo a realização do " },
    { text: "diagnóstico técnico", callout: true },
    { text: " em meu veículo e declaro estar ciente de que " },
    { text: "será cobrado", callout: true },
    { text: " o valor de " },
    { text: "R$ 450,00", callout: true },
    { text: " referente ao " },
    { text: "tempo técnico, análises e testes", callout: true },
    { text: " necessários para identificação da falha apresentada." },
  ],
  [
    { text: "Estou ciente de que, em caso de " },
    { text: "aprovação do orçamento de reparo", callout: true },
    { text: ", o valor do diagnóstico " },
    { text: "não será cobrado separadamente", callout: true },
    { text: ". " },
    { text: "Caso o orçamento não seja aprovado", callout: true },
    { text: ", o valor do diagnóstico " },
    { text: "será devido normalmente", callout: true },
    { text: "." },
  ],
] as const;

/** Texto integral — junção dos segmentos (para compatibilidade e conferência). */
export const DIAGNOSTIC_AUTHORIZATION_PARAGRAPHS: readonly string[] = DIAGNOSTIC_AUTHORIZATION_PARAGRAPH_CHUNKS.map(
  (chunks) => chunks.map((c) => c.text).join("")
);

export const DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL = "Assinatura do Cliente:";
