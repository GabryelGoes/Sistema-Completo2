import React from 'react';
import {
  iosPageTitleIconShell,
  iosPageTitleIconGlass,
  iosPageTitleIconGlyph,
  iosAccentIconShellModal,
  iosAccentIconShellRow,
  iosAccentIconShellTile,
  iosAccentIconGlyphModal,
  iosAccentIconGlyphRow,
  iosAccentIconGlyphTile,
} from './iosModalStyles';

export type IosAccentIconSquircleVariant = 'page' | 'modal' | 'row' | 'tile';

const SHELL: Record<IosAccentIconSquircleVariant, string> = {
  page: iosPageTitleIconShell,
  modal: iosAccentIconShellModal,
  row: iosAccentIconShellRow,
  tile: iosAccentIconShellTile,
};

const GLYPH: Record<IosAccentIconSquircleVariant, string> = {
  page: iosPageTitleIconGlyph,
  modal: iosAccentIconGlyphModal,
  row: iosAccentIconGlyphRow,
  tile: iosAccentIconGlyphTile,
};

type Props = {
  variant: IosAccentIconSquircleVariant;
  className?: string;
  /** pictograma Lucide ou PatioCarIcon */
  children: React.ReactElement<{ className?: string; strokeWidth?: number }>;
  strokeWidth?: number;
};

/**
 * Ícone em squircle com cor de destaque da oficina + vidro (mesmo padrão dos títulos Recepção/Agenda/Pátio).
 */
export const IosAccentIconSquircle: React.FC<Props> = ({
  variant,
  className = '',
  children,
  strokeWidth,
}) => {
  const shell = SHELL[variant];
  const glyph = GLYPH[variant];
  const merged = [glyph, children.props.className].filter(Boolean).join(' ');
  const child = React.cloneElement(children, {
    className: merged,
    strokeWidth: strokeWidth ?? children.props.strokeWidth,
  });
  return (
    <div className={`${shell} ${className}`.trim()} aria-hidden>
      <span className={iosPageTitleIconGlass} aria-hidden />
      {child}
    </div>
  );
};
