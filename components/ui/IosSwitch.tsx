import React from 'react';

export type IosSwitchSize = 'default' | 'compact';

export type IosSwitchProps = {
  checked: boolean;
  onChange: () => void;
  id: string;
  ariaLabel: string;
  disabled?: boolean;
  size?: IosSwitchSize;
};

/** Interruptor estilo iOS (UISwitch) com trilho em camadas. */
export function IosSwitch({
  checked,
  onChange,
  id,
  ariaLabel,
  disabled = false,
  size = 'default',
}: IosSwitchProps) {
  return (
    <label
      htmlFor={id}
      className={`ios-switch ios-switch--${size}${disabled ? ' ios-switch--disabled' : ''}`}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="ios-switch__input"
        aria-checked={checked}
        aria-label={ariaLabel}
      />
      <span className="ios-switch__base-outer" aria-hidden>
        <span className="ios-switch__base-inner" />
      </span>
      <span className="ios-switch__knob" aria-hidden />
    </label>
  );
}
