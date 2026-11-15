/**
 * SEC-03.27.1 — aprovação de itens no PUT do orçamento.
 * Quem só aprova não grava o corpo recebido. Os itens saem da linha já
 * armazenada, com a flag `approved` trocada, e só se o restante for idêntico.
 * Campo extra, preço, quantidade, descrição, ordem ou diagnóstico diferente
 * não é uma aprovação da linha atual.
 */

const ACTOR_KEYS = new Set([
  "actor",
  "actorTechnicianSlug",
  "actorTechnicianName",
  "actorDisplayName",
]);

const CONTENT_KEYS = new Set(["cardName", "diagnosis", "services", "parts", "observations"]);

export type StoredBudgetContent = {
  card_name?: unknown;
  diagnosis?: unknown;
  observations?: unknown;
  services?: unknown;
  parts?: unknown;
  updated_at?: unknown;
};

export type BudgetPutAssessment =
  | { kind: "approval"; services: unknown[]; parts: unknown[] }
  | { kind: "rejected" };

function asText(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  const text = asText(value).trim();
  return text ? text : null;
}

function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canon(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => key !== "approved")
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canon(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameItemContent(stored: unknown, incoming: unknown): boolean {
  return canon(stored) === canon(incoming);
}

function applyFlag(stored: unknown, incoming: unknown): Record<string, unknown> {
  const base =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (JSON.parse(JSON.stringify(stored)) as Record<string, unknown>)
      : {};
  const flag =
    incoming && typeof incoming === "object" && !Array.isArray(incoming)
      ? (incoming as { approved?: unknown }).approved
      : undefined;
  if (flag === true) base.approved = true;
  else if (flag === false) base.approved = false;
  else delete base.approved;
  return base;
}

function sameList(stored: unknown, incoming: unknown): boolean {
  const left = Array.isArray(stored) ? stored : null;
  const right = Array.isArray(incoming) ? incoming : null;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((item, index) => sameItemContent(item, right[index]));
}

/** true quando o corpo só muda flags `approved` da linha atual. */
export function assessBudgetApprovalPut(
  stored: StoredBudgetContent | null | undefined,
  body: unknown
): BudgetPutAssessment {
  if (!stored || !body || typeof body !== "object" || Array.isArray(body)) return { kind: "rejected" };
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!CONTENT_KEYS.has(key) && !ACTOR_KEYS.has(key)) return { kind: "rejected" };
  }
  if (!Array.isArray(record.services) || !Array.isArray(record.parts)) return { kind: "rejected" };
  if (asText(record.diagnosis) !== asText(stored.diagnosis)) return { kind: "rejected" };
  if (asText(record.observations) !== asText(stored.observations)) return { kind: "rejected" };
  if (optionalText(record.cardName) !== optionalText(stored.card_name)) return { kind: "rejected" };
  if (!sameList(stored.services, record.services) || !sameList(stored.parts, record.parts)) {
    return { kind: "rejected" };
  }
  const storedServices = Array.isArray(stored.services) ? stored.services : [];
  const storedParts = Array.isArray(stored.parts) ? stored.parts : [];
  return {
    kind: "approval",
    services: storedServices.map((item, index) => applyFlag(item, record.services[index])),
    parts: storedParts.map((item, index) => applyFlag(item, record.parts[index])),
  };
}
