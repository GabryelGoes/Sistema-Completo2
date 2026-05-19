/** Detecta imagem/PDF em anexos (Pátio, Radar de Qualidade, relatórios). */
export function isAttachmentImage(att: {
  kind?: string;
  mimeType?: string | null;
  url?: string;
  name?: string;
}): boolean {
  if (att.kind === 'photo') return true;
  if (att.mimeType?.startsWith('image/')) return true;
  const ref = `${att.url ?? ''} ${att.name ?? ''}`;
  return /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/i.test(ref);
}

export function isAttachmentPdf(att: {
  kind?: string;
  mimeType?: string | null;
  url?: string;
  name?: string;
}): boolean {
  if (att.mimeType === 'application/pdf') return true;
  const ref = `${att.url ?? ''} ${att.name ?? ''}`;
  return /\.pdf$/i.test(ref);
}
