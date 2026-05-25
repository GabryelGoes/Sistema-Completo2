import React, { useEffect, useMemo, useState } from 'react';

function withReloadToken(url: string, attempt: number): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed;
  if (attempt <= 0) return trimmed;
  const [base, query = ''] = trimmed.split('?');
  const params = new URLSearchParams(query);
  params.set('_img', String(Date.now()));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : `${base}?_img=${Date.now()}`;
}

type PartPhotoImgProps = {
  src: string;
  alt?: string;
  className?: string;
};

/**
 * Miniatura/foto de produto no estoque.
 * `loading="eager"` evita falha de lazy load dentro de modais com scroll e backdrop-blur (iOS/tablet).
 */
export function PartPhotoImg({ src, alt = '', className }: PartPhotoImgProps) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const resolvedSrc = useMemo(() => withReloadToken(src, attempt), [src, attempt]);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [src]);

  if (!src.trim() || failed) return null;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      loading="eager"
      decoding="async"
      draggable={false}
      onError={() => {
        if (attempt < 2) setAttempt((n) => n + 1);
        else setFailed(true);
      }}
    />
  );
}
