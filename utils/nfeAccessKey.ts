/** Chave de acesso da NF-e (44 dígitos) — validação e sanitização para leitor USB. */

export function sanitizeNfeAccessKeyInput(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s.\-_/]/g, '')
    .trim();
}

/** Extrai apenas dígitos (útil se o leitor misturar lixo). */
export function digitsOnlyNfeAccessKey(raw: string): string {
  return sanitizeNfeAccessKeyInput(raw).replace(/\D/g, '');
}

/** DV módulo 11 da chave NF-e (pesos 2–9 da direita para a esquerda). */
export function calculateNfeAccessKeyCheckDigit(first43Digits: string): string {
  const base = String(first43Digits ?? '').replace(/\D/g, '');
  if (base.length !== 43) {
    throw new Error('Base da chave deve ter 43 dígitos para calcular o DV.');
  }
  let sum = 0;
  let weight = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  const dv = mod === 0 || mod === 1 ? 0 : 11 - mod;
  return String(dv);
}

export function isValidNfeAccessKeyCheckDigit(accessKey: string): boolean {
  const key = digitsOnlyNfeAccessKey(accessKey);
  if (key.length !== 44) return false;
  try {
    return calculateNfeAccessKeyCheckDigit(key.slice(0, 43)) === key.slice(43);
  } catch {
    return false;
  }
}

/** Modelo fiscal nas posições 21–22 (1-based): 55=NF-e, 65=NFC-e. */
export function getNfeAccessKeyModel(accessKey: string): string | null {
  const key = digitsOnlyNfeAccessKey(accessKey);
  if (key.length !== 44) return null;
  return key.slice(20, 22);
}

export function isNfeAccessKeyModel55(accessKey: string): boolean {
  return getNfeAccessKeyModel(accessKey) === '55';
}

export type NfeAccessKeyValidation =
  | { ok: true; accessKey: string; model: string }
  | { ok: false; error: string };

export function validateNfeAccessKey(raw: string): NfeAccessKeyValidation {
  const accessKey = digitsOnlyNfeAccessKey(raw);
  if (!accessKey) {
    return { ok: false, error: 'Informe a chave de acesso da NF-e.' };
  }
  if (accessKey.length !== 44) {
    return {
      ok: false,
      error: `A chave deve ter exatamente 44 dígitos (recebido: ${accessKey.length}).`,
    };
  }
  if (!/^\d{44}$/.test(accessKey)) {
    return { ok: false, error: 'A chave de acesso deve conter apenas dígitos.' };
  }
  if (!isValidNfeAccessKeyCheckDigit(accessKey)) {
    return { ok: false, error: 'Dígito verificador da chave de acesso inválido.' };
  }
  const model = getNfeAccessKeyModel(accessKey) || '';
  if (model !== '55') {
    return {
      ok: false,
      error:
        model === '65'
          ? 'Esta chave é de NFC-e (modelo 65). Use uma chave de NF-e (modelo 55).'
          : `Modelo fiscal ${model || '—'} não é NF-e (esperado 55).`,
    };
  }
  return { ok: true, accessKey, model };
}
