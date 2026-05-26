import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyCurrencyMaskBackspace,
  applyCurrencyMaskDigit,
  centsToFormValueString,
  formatCurrencyMaskDisplay,
  numberToCurrencyMaskCents,
  parseCurrencyStringToNumber,
  parsePastedCurrencyToCents,
} from '../../utils/currencyMaskInput';

const defaultInputCls =
  'w-full min-w-0 rounded-lg border border-zinc-200/90 dark:border-white/10 bg-zinc-100 dark:bg-white/5 px-3 py-2 text-[14px] text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/40 tabular-nums shadow-[0_2px_10px_-3px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none';

export type CurrencyMaskInputProps = {
  /** Valor numérico em string (ex.: "123.45") para o formulário. */
  value: string;
  onChange: (value: string) => void;
  showPrefix?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

/**
 * Campo monetário BR: vírgula sempre visível; cada dígito empurra os anteriores para a esquerda (0,00 → 0,01 → 0,12 → 1,23).
 */
export const CurrencyMaskInput: React.FC<CurrencyMaskInputProps> = ({
  value,
  onChange,
  showPrefix = true,
  className = '',
  inputClassName = '',
  id,
  disabled = false,
  'aria-label': ariaLabel,
}) => {
  const centsFromProp = numberToCurrencyMaskCents(parseCurrencyStringToNumber(value));
  const [cents, setCents] = useState(centsFromProp);
  const lastEmitted = useRef(centsToFormValueString(centsFromProp));

  useEffect(() => {
    const parsed = centsToFormValueString(centsFromProp);
    if (parsed !== lastEmitted.current) {
      setCents(centsFromProp);
      lastEmitted.current = parsed;
    }
  }, [centsFromProp]);

  const emitCents = useCallback(
    (nextCents: number) => {
      const clamped = Math.max(0, nextCents);
      setCents(clamped);
      const str = centsToFormValueString(clamped);
      lastEmitted.current = str;
      onChange(str);
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      emitCents(applyCurrencyMaskDigit(cents, Number(e.key)));
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      emitCents(applyCurrencyMaskBackspace(cents));
      return;
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      emitCents(0);
    }
  };

  const handleBeforeInput = (e: React.FormEvent<HTMLInputElement>) => {
    if (disabled) return;
    const native = e.nativeEvent as InputEvent;
    if (native.inputType === 'insertText' && native.data && /^\d$/.test(native.data)) {
      e.preventDefault();
      emitCents(applyCurrencyMaskDigit(cents, Number(native.data)));
    } else if (native.inputType === 'deleteContentBackward') {
      e.preventDefault();
      emitCents(applyCurrencyMaskBackspace(cents));
    } else if (
      native.inputType === 'insertFromPaste' ||
      native.inputType === 'insertFromDrop'
    ) {
      return;
    } else if (
      native.inputType?.startsWith('insert') ||
      native.inputType?.startsWith('delete')
    ) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const pasted = parsePastedCurrencyToCents(e.clipboardData.getData('text'));
    if (pasted != null) emitCents(pasted);
  };

  const display = formatCurrencyMaskDisplay(cents);

  return (
    <div className={`relative ${className}`}>
      {showPrefix ? (
        <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
          R$
        </span>
      ) : null}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-label={ariaLabel}
        value={display}
        readOnly={false}
        onKeyDown={handleKeyDown}
        onBeforeInput={handleBeforeInput}
        onPaste={handlePaste}
        onChange={() => {
          /* valor controlado via máscara */
        }}
        onFocus={(e) => e.currentTarget.select()}
        className={`${inputClassName || defaultInputCls} ${showPrefix ? 'pl-9' : ''}`.trim()}
      />
    </div>
  );
};
