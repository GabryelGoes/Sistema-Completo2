/** Delimitador do título: "modelo - placa - cliente". Não usar só "-" para não quebrar modelos como HR-V. */
export const PATIO_CARD_TITLE_SEP = " - ";

export function parsePatioCardTitle(name: string): { vehicle: string; plateOrModule: string; customer: string } {
  const parts = name.split(PATIO_CARD_TITLE_SEP).map((s) => s.trim());
  if (parts.length === 0) return { vehicle: name.trim(), plateOrModule: "", customer: "" };
  if (parts.length === 1) return { vehicle: parts[0] ?? "", plateOrModule: "", customer: "" };
  if (parts.length === 2) return { vehicle: parts[0] ?? "", plateOrModule: parts[1] ?? "", customer: "" };
  return {
    vehicle: parts[0] ?? "",
    plateOrModule: parts[1] ?? "",
    customer: parts.slice(2).join(PATIO_CARD_TITLE_SEP),
  };
}
