/**
 * Copia uma imagem para a área de transferência do sistema (colar em outros apps no PC).
 * Tenta a partir do <img> renderizado; se falhar (CORS), faz fetch da URL.
 */
export async function copyImageToClipboard(opts: {
  url: string;
  imgEl?: HTMLImageElement | null;
}): Promise<void> {
  const { url, imgEl } = opts;
  if (!url) throw new Error('Imagem indisponível.');
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Este navegador não permite copiar imagem. Use o botão direito → Copiar imagem.');
  }

  let blob: Blob | null = null;

  if (imgEl?.complete && imgEl.naturalWidth > 0) {
    try {
      blob = await rasterizeImageElement(imgEl);
    } catch {
      blob = null;
    }
  }

  if (!blob) {
    blob = await fetchImageBlob(url);
  }

  const png = await ensurePngBlob(blob);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
  if (!res.ok) {
    throw new Error('Não foi possível baixar a imagem para copiar.');
  }
  return res.blob();
}

async function rasterizeImageElement(img: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar PNG.'))),
      'image/png'
    );
  });
}

async function ensurePngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível.');
    ctx.drawImage(bitmap, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar PNG.'))),
        'image/png'
      );
    });
  } finally {
    bitmap.close();
  }
}
