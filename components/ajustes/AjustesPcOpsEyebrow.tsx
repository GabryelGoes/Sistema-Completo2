import React from 'react';

/** Eyebrow desktop do hub de Ajustes — só renderiza no shell PC. */
export function AjustesPcOpsEyebrow({
  desktop,
  children,
}: {
  desktop: boolean;
  children: React.ReactNode;
}) {
  if (!desktop) return null;
  return <p className="ajustes-pc-child-eyebrow">{children}</p>;
}
