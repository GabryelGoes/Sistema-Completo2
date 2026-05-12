import React from "react";

export type DiagnosticLegalPresentation = "modal" | "compact" | "certificate";

const titleMain =
  "AUTORIZAÇÃO PARA REALIZAÇÃO DE DIAGNÓSTICO TÉCNICO EM VEÍCULO AUTOMOTOR";

/**
 * Texto jurídico — modal de assinatura, painel na OS e documento para impressão/PDF.
 */
export function DiagnosticAuthorizationLegalText({
  presentation,
  declarantName,
  vehicleSummary,
}: {
  presentation: DiagnosticLegalPresentation;
  declarantName?: string;
  vehicleSummary?: string;
}) {
  const isCert = presentation === "certificate";
  const isModal = presentation === "modal";
  const isCompact = presentation === "compact";

  const rubrica = (t: string) => (
    <p
      className={
        isCert
          ? "text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-600"
          : isModal
            ? "text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400"
            : "text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400"
      }
    >
      {t}
    </p>
  );

  const sectionTitle = (n: string, t: string) => (
    <h3
      className={
        isCert
          ? "mt-7 border-b border-zinc-900/25 pb-1.5 text-[13px] font-bold uppercase tracking-[0.12em] text-zinc-900 first:mt-5"
          : isModal
            ? "mt-5 border-b border-zinc-300/90 pb-1 text-[12px] font-bold uppercase tracking-[0.1em] text-zinc-900 dark:border-white/15 dark:text-white first:mt-0"
            : "mt-4 border-b border-zinc-200/80 pb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-800 first:mt-0 dark:border-white/10 dark:text-zinc-100"
      }
    >
      <span className="text-[#007AFF] dark:text-[#7ab8ff]">{n}</span> {t}
    </h3>
  );

  const bodyP = (children: React.ReactNode, key?: string) => (
    <p
      key={key}
      className={
        isCert
          ? "mt-3 text-[13px] leading-[1.72] text-zinc-900 text-justify"
          : isModal
            ? "mt-3 text-[14px] leading-[1.65] text-zinc-800 text-justify dark:text-zinc-100"
            : "mt-2.5 text-[11.5px] leading-[1.62] text-zinc-700 text-justify dark:text-zinc-200"
      }
    >
      {children}
    </p>
  );

  const em = (t: string) => (
    <strong
      className={
        isCert
          ? "font-bold uppercase tracking-[0.03em] text-zinc-950"
          : "font-bold uppercase tracking-wide text-zinc-950 dark:text-white"
      }
    >
      {t}
    </strong>
  );

  const lead = (t: string) => (
    <span
      className={
        isCert
          ? "text-[14px] font-semibold text-zinc-900"
          : isModal
            ? "text-[15px] font-semibold text-zinc-900 dark:text-white"
            : "text-[12px] font-semibold text-zinc-900 dark:text-zinc-100"
      }
    >
      {t}
    </span>
  );

  const titleBlock = (
    <div className="text-center">
      {rubrica("Documento particular · instrumento de manifestação de vontade")}
      <h2
        className={
          isCert
            ? "mt-4 text-center text-[20px] font-extrabold uppercase leading-tight tracking-[0.06em] text-zinc-950 sm:text-[22px]"
            : isModal
              ? "mt-3 text-center text-[17px] font-extrabold uppercase leading-snug tracking-[0.05em] text-zinc-950 dark:text-white sm:text-[19px]"
              : "mt-2 text-center text-[12px] font-extrabold uppercase leading-snug tracking-[0.04em] text-zinc-900 dark:text-white"
        }
      >
        {titleMain}
      </h2>
      {(declarantName?.trim() || vehicleSummary?.trim()) && (
        <div
          className={
            isCert
              ? "mx-auto mt-5 max-w-xl rounded-lg border border-zinc-900/15 bg-zinc-900/[0.03] px-4 py-3 text-left text-[12px] leading-relaxed text-zinc-800"
              : isModal
                ? "mx-auto mt-4 max-w-md rounded-xl border border-zinc-200/80 bg-white/80 px-3 py-2.5 text-left text-[12px] text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200"
                : "mx-auto mt-3 max-w-md rounded-lg border border-zinc-200/70 bg-zinc-50/80 px-2.5 py-2 text-left text-[10.5px] text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200"
          }
        >
          {declarantName?.trim() ? (
            <p>
              <span className="font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Declarante: </span>
              {declarantName.trim()}
            </p>
          ) : null}
          {vehicleSummary?.trim() ? (
            <p className={declarantName?.trim() ? "mt-1" : ""}>
              <span className="font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Veículo: </span>
              {vehicleSummary.trim()}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );

  const clauses = (
    <>
      {sectionTitle("I", "Das partes e da finalidade")}
      {bodyP(
        <>
          O(A) signatário(a), qualificado(a) neste instrumento como {lead("CONSUMIDOR(A) DE SERVIÇOS AUTOMOTIVOS")},{" "}
          declara, sob as penas da lei, que outorga autorização à oficina receptora para a execução dos atos descritos nas cláusulas seguintes,
          estritamente vinculados à análise técnica do veículo apresentado.
        </>
      )}

      {sectionTitle("II", "Da autorização e do valor do serviço técnico")}
      {bodyP(
        <>
          Autorizo, na forma da legislação consumerista e das práticas de mercado aplicáveis, a {em("REALIZAÇÃO INTEGRAL DO DIAGNÓSTICO TÉCNICO")}{" "}
          em meu veículo, compreendendo levantamento da queixa, inspeções, testes em bancada e/ou estrada, quando necessários, e demais procedimentos
          técnicos indispensáveis à {em("IDENTIFICAÇÃO DA FALHA OU ANOMALIA")} relatada.
        </>
      )}
      {bodyP(
        <>
          Declaro estar plenamente ciente de que será cobrado o valor de {em("R$ 450,00 (QUATROCENTOS E CINQUENTA REAIS)")}, correspondente a{" "}
          {em("TEMPO TÉCNICO")}, {em("ANÁLISES")} e {em("TESTES")} necessários à elucidação do defeito, valores estes comunicados de forma transparente
          antes da presente manifestação de vontade.
        </>
      )}

      {sectionTitle("III", "Dos efeitos em relação ao orçamento de reparo")}
      {bodyP(
        <>
          Fica desde já ajustado que: {em("(A)")} em caso de {em("APROVAÇÃO DO ORÇAMENTO DE REPARO")}, o valor do diagnóstico técnico{" "}
          <strong>não será cobrado de forma segregada</strong>, integrando a lógica comercial acordada com a oficina; {em("(B)")} na hipótese de{" "}
          {em("NÃO APROVAÇÃO")} do referido orçamento, o valor do diagnóstico será {em("DEVIDO E COBRÁVEL")} nos termos ordinários, sem prejuízo de
          eventuais acordos posteriores de boa-fé entre as partes.
        </>
      )}

      {sectionTitle("IV", "Da ciência, veracidade e concordância")}
      {bodyP(
        <>
          Declaro ter lido integralmente este instrumento, compreendido seu alcance jurídico e econômico, e {em("CONCORDAR")} com todas as cláusulas
          acima, responsabilizando-me pela veracidade das informações prestadas e pela legitimidade da assinatura aposta ao final.
        </>
      )}
    </>
  );

  return (
    <div className={isCompact ? "space-y-0.5" : "space-y-1"}>
      {titleBlock}
      {clauses}
    </div>
  );
}

export { titleMain as DIAGNOSTIC_AUTHORIZATION_TITLE_FULL };
