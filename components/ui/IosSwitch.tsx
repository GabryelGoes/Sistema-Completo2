import React from 'react';

export type IosSwitchSize = 'default' | 'compact';
export type IosSwitchAppearance = 'ios' | 'neo';

export type IosSwitchProps = {
  checked: boolean;
  onChange: () => void;
  id: string;
  ariaLabel: string;
  disabled?: boolean;
  size?: IosSwitchSize;
  /** `neo` = neomórfico com aro colorido (sidebar PC); `ios` = interruptor iOS plano. */
  appearance?: IosSwitchAppearance;
};

/** Interruptor — iOS plano ou neomórfico 3D. */
export function IosSwitch({
  checked,
  onChange,
  id,
  ariaLabel,
  disabled = false,
  size = 'default',
  appearance = 'ios',
}: IosSwitchProps) {
  const rootClass = `ios-switch ios-switch--${appearance} ios-switch--${size}${
    disabled ? ' ios-switch--disabled' : ''
  }`;

  const input = (
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
  );

  if (appearance === 'neo') {
    return (
      <label htmlFor={id} className={rootClass}>
        {input}
        <span className="ios-switch__track" aria-hidden>
          <span className="ios-switch__knob" />
        </span>
      </label>
    );
  }

  return (
    <label htmlFor={id} className={rootClass}>
      {input}
      <span className="ios-switch__base-outer" aria-hidden>
        <span className="ios-switch__base-inner" />
      </span>
      <span className="ios-switch__knob" aria-hidden />
    </label>
  );
}
