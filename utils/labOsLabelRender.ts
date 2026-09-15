import QRCode from 'qrcode';
import { buildLabOsQrPayload } from './labOsQrCode';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';

export type LabOsLabelInput = {
  serviceOrderId: string;
  customerName: string;
  vehicleName: string;
  /** Queixa — uma linha na etiqueta. */
  complaint: string;
  osNumber?: number | null;
};

function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return '—';
  if (ctx.measureText(t).width <= maxWidth) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

/** Renderiza etiqueta 50×30 mm (384×240) com QR da OS + textos. */
export async function renderLabOsLabelDataUrl(input: LabOsLabelInput): Promise<string> {
  const payload = buildLabOsQrPayload(input.serviceOrderId);
  const w = NIIMBOT_LABEL_W_PX;
  const h = NIIMBOT_LABEL_H_PX;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const qrSize = 168;
  const qrX = w - qrSize - 8;
  const qrY = Math.floor((h - qrSize) / 2);
  const textMax = qrX - 14;

  const qrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: qrSize,
    color: { dark: '#000000', light: '#ffffff' },
  });
  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  let y = 14;
  if (input.osNumber != null) {
    ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
    ctx.fillText(truncateToWidth(ctx, `OS #${input.osNumber}`, textMax), 10, y);
    y += 18;
  }

  ctx.font = 'bold 17px Arial, Helvetica, sans-serif';
  ctx.fillText(truncateToWidth(ctx, input.customerName || 'Cliente', textMax), 10, y);
  y += 24;

  ctx.font = 'bold 15px Arial, Helvetica, sans-serif';
  ctx.fillText(truncateToWidth(ctx, input.vehicleName || 'Veículo', textMax), 10, y);
  y += 22;

  ctx.font = '13px Arial, Helvetica, sans-serif';
  const complaint = (input.complaint || '').trim().replace(/\s+/g, ' ') || '—';
  ctx.fillText(truncateToWidth(ctx, complaint, textMax), 10, y);

  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao montar QR Code'));
    img.src = src;
  });
}
