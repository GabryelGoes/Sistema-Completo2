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
  iosSquircleBackgroundFromHex,
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
  /** Cor do squircle (#RRGGBB). Sobrepõe o gradiente `brand-yellow` (modo colorido na home, etc.). */
  accentHex?: string;
};

/**
 * Ícone em squircle com cor de destaque da oficina + vidro (mesmo padrão dos títulos Recepção/Agenda/Pátio).
 */
export const IosAccentIconSquircle: React.FC<Props> = ({
  variant,
  className = '',
  children,
  strokeWidth,
  accentHex,
}) => {
  const shell = SHELL[variant];
  const glyph = GLYPH[variant];
  const merged = [glyph, children.props.className].filter(Boolean).join(' ');
  const child = React.cloneElement(children, {
    className: merged,
    strokeWidth: strokeWidth ?? children.props.strokeWidth,
  });
  const bgStyle = accentHex ? iosSquircleBackgroundFromHex(accentHex) : undefined;
  return (
    <div className={`${shell} ${className}`.trim()} style={bgStyle} aria-hidden>
      <span className={iosPageTitleIconGlass} aria-hidden />
      {child}
    </div>
  );
};
