/** Utilitários de CPF/CNPJ (documento brasileiro). */

export function onlyDigits(value: string): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Máscara progressiva: CPF (11) ou CNPJ (14). */
export function formatCpfCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function allSameDigits(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

function cpfCheckDigit(base: string, factorStart: number): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += Number(base[i]) * (factorStart - i);
  }
  const mod = (sum * 10) % 11;
  return mod === 10 ? 0 : mod;
}

/** CPF com 11 dígitos (algoritmo oficial). */
export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || allSameDigits(d)) return false;
  const d1 = cpfCheckDigit(d.slice(0, 9), 10);
  if (d1 !== Number(d[9])) return false;
  const d2 = cpfCheckDigit(d.slice(0, 10), 11);
  return d2 === Number(d[10]);
}

function cnpjCheckDigit(base: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += Number(base[i]) * weights[i];
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

/** CNPJ com 14 dígitos (algoritmo oficial). */
export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || allSameDigits(d)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = cnpjCheckDigit(d.slice(0, 12), w1);
  if (d1 !== Number(d[12])) return false;
  const d2 = cnpjCheckDigit(d.slice(0, 13), w2);
  return d2 === Number(d[13]);
}

export type CpfCnpjStatus = 'empty' | 'incomplete' | 'invalid' | 'cpf' | 'cnpj';

export function getCpfCnpjStatus(value: string): CpfCnpjStatus {
  const d = onlyDigits(value);
  if (!d) return 'empty';
  if (d.length < 11) return 'incomplete';
  if (d.length === 11) return isValidCpf(d) ? 'cpf' : 'invalid';
  if (d.length < 14) return 'incomplete';
  if (d.length === 14) return isValidCnpj(d) ? 'cnpj' : 'invalid';
  return 'invalid';
}

export function isValidCpfOrCnpj(value: string): boolean {
  const status = getCpfCnpjStatus(value);
  return status === 'cpf' || status === 'cnpj';
}

export function cpfCnpjLabel(value: string): 'CPF' | 'CNPJ' | 'CPF/CNPJ' {
  const status = getCpfCnpjStatus(value);
  if (status === 'cpf') return 'CPF';
  if (status === 'cnpj') return 'CNPJ';
  return 'CPF/CNPJ';
}
