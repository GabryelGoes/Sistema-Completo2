import React, { useEffect, useMemo, useState } from 'react';
import { storageThumbnailUrl, type StorageThumbOptions } from '../../utils/storageThumbnailUrl';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  /** URL original (Storage ou outra); miniatura derivada quando for Supabase. */
  src: string;
  thumbMaxWidth?: number;
  thumbMaxHeight?: number;
  thumbResize?: StorageThumbOptions['resize'];
  thumbQuality?: number;
  thumbFormat?: StorageThumbOptions['format'];
  fetchPriority?: 'high' | 'low' | 'auto';
};

/**
 * Miniatura com lazy load + tentativa de URL transformada do Supabase; em erro, usa a original.
 * Padrões agressivos (largura ~200px, qualidade ~52, WebP) para peso menor; ajuste via props em telas grandes.
 */
export function StorageThumbImg({
  src,
  alt,
  thumbMaxWidth = 200,
  thumbMaxHeight,
  thumbResize = 'cover',
  thumbQuality = 52,
  thumbFormat = 'webp',
  loading = 'lazy',
  decoding = 'async',
  fetchPriority = 'low',
  onError,
  ...rest
}: Props) {
  const thumb = useMemo(
    () =>
      storageThumbnailUrl(src, {
        maxWidth: thumbMaxWidth,
        maxHeight: thumbMaxHeight,
        resize: thumbMaxHeight != null ? thumbResize : undefined,
        quality: thumbQuality,
        format: thumbFormat,
      }),
    [src, thumbMaxWidth, thumbMaxHeight, thumbResize, thumbQuality, thumbFormat]
  );
  const [useOriginal, setUseOriginal] = useState(false);

  useEffect(() => {
    setUseOriginal(false);
  }, [src, thumb]);

  const effective = useOriginal ? src : thumb;

  return (
    <img
      {...rest}
      key={effective}
      src={effective}
      alt={alt}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      onError={(e) => {
        if (!useOriginal && thumb !== src) {
          setUseOriginal(true);
        }
        onError?.(e);
      }}
    />
  );
}
