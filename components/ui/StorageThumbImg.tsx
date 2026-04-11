import React, { useMemo, useState } from 'react';
import { storageThumbnailUrl, type StorageThumbOptions } from '../../utils/storageThumbnailUrl';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  /** URL original (Storage ou outra); miniatura derivada quando for Supabase. */
  src: string;
  thumbMaxWidth?: number;
  thumbQuality?: number;
  thumbFormat?: StorageThumbOptions['format'];
};

/**
 * Miniatura com lazy load + tentativa de URL transformada do Supabase; em erro, usa a original.
 * Padrões agressivos (largura ~260px, qualidade ~62, WebP) para peso menor; ajuste via props em telas grandes.
 */
export function StorageThumbImg({
  src,
  alt,
  thumbMaxWidth = 260,
  thumbQuality = 62,
  thumbFormat = 'webp',
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...rest
}: Props) {
  const thumb = useMemo(
    () => storageThumbnailUrl(src, { maxWidth: thumbMaxWidth, quality: thumbQuality, format: thumbFormat }),
    [src, thumbMaxWidth, thumbQuality, thumbFormat]
  );
  const [useOriginal, setUseOriginal] = useState(false);
  const effective = useOriginal ? src : thumb;

  return (
    <img
      {...rest}
      src={effective}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={(e) => {
        if (!useOriginal && thumb !== src) {
          setUseOriginal(true);
        }
        onError?.(e);
      }}
    />
  );
}
