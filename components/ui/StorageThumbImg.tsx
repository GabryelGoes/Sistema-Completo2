import React, { useMemo, useState } from 'react';
import { storageThumbnailUrl } from '../../utils/storageThumbnailUrl';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  /** URL original (Storage ou outra); miniatura derivada quando for Supabase. */
  src: string;
  thumbMaxWidth?: number;
  thumbQuality?: number;
};

/**
 * Miniatura com lazy load + tentativa de URL transformada do Supabase; em erro, usa a original.
 */
export function StorageThumbImg({
  src,
  alt,
  thumbMaxWidth = 420,
  thumbQuality = 78,
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...rest
}: Props) {
  const thumb = useMemo(
    () => storageThumbnailUrl(src, { maxWidth: thumbMaxWidth, quality: thumbQuality }),
    [src, thumbMaxWidth, thumbQuality]
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
