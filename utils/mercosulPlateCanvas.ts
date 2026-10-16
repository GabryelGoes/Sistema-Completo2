/**
 * Desenha uma placa Mercosul BR em canvas (adequado à térmica 1-bit).
 * Proporção oficial aproximada 400×140 mm.
 */

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Normaliza placa para exibição (sem espaços, maiúsculas). */
export function formatPlateForMercosul(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '')
    .toLocaleUpperCase('pt-BR')
    .slice(0, 8) || '—';
}

/**
 * Desenha a placa Mercosul em (x,y,w,h).
 * Usa preto/branco — na térmica a faixa superior vira faixa escura com letras claras.
 */
export function drawMercosulPlateOnCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  plateRaw: string
): void {
  const plate = formatPlateForMercosul(plateRaw);
  const width = Math.max(24, w);
  const height = Math.max(14, h);
  const border = clamp(Math.round(Math.min(width, height) * 0.035), 1, 3);
  const innerX = x + border;
  const innerY = y + border;
  const innerW = Math.max(8, width - border * 2);
  const innerH = Math.max(8, height - border * 2);
  const bandH = Math.max(6, Math.round(innerH * 0.22));
  const bodyH = Math.max(6, innerH - bandH);

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, width, height);

  // Moldura externa
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = border;
  ctx.strokeRect(x + border / 2, y + border / 2, width - border, height - border);

  // Faixa superior (azul → preto na térmica)
  ctx.fillStyle = '#000000';
  ctx.fillRect(innerX, innerY, innerW, bandH);

  // Moldura interna fina
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1, Math.round(border * 0.6));
  ctx.strokeRect(innerX + 0.5, innerY + 0.5, innerW - 1, innerH - 1);

  // "BRASIL" + retângulo da bandeira (simplificado)
  const padX = Math.max(2, Math.round(innerW * 0.04));
  const flagW = Math.max(8, Math.round(innerW * 0.14));
  const flagH = Math.max(5, Math.round(bandH * 0.62));
  const flagX = innerX + innerW - padX - flagW;
  const flagY = innerY + (bandH - flagH) / 2;

  ctx.fillStyle = '#ffffff';
  const bandFont = Math.max(5, Math.min(11, Math.round(bandH * 0.55)));
  ctx.font = `bold ${bandFont}px Arial, Helvetica, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('BRASIL', innerX + padX, innerY + bandH / 2);

  // Bandeira esquemática P&B (retângulo + losango + círculo)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(flagX + 0.5, flagY + 0.5, flagW - 1, flagH - 1);
  ctx.beginPath();
  ctx.moveTo(flagX + flagW / 2, flagY + 1);
  ctx.lineTo(flagX + flagW - 1, flagY + flagH / 2);
  ctx.lineTo(flagX + flagW / 2, flagY + flagH - 1);
  ctx.lineTo(flagX + 1, flagY + flagH / 2);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(flagX + flagW / 2, flagY + flagH / 2, Math.max(1.5, flagH * 0.22), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Corpo da placa + texto
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(innerX, innerY + bandH, innerW, bodyH);

  const plateFont = Math.max(8, Math.min(42, Math.round(bodyH * 0.72)));
  ctx.fillStyle = '#000000';
  ctx.font = `900 ${plateFont}px Arial Narrow, Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Leve condensação horizontal (tipografia de placa)
  const cx = innerX + innerW / 2;
  const cy = innerY + bandH + bodyH / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.92, 1);
  let display = plate;
  while (display.length > 1 && ctx.measureText(display).width > innerW * 0.92) {
    display = display.slice(0, -1);
  }
  ctx.fillText(display, 0, 0);
  ctx.restore();

  ctx.restore();
}
