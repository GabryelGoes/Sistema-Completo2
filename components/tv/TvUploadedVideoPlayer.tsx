import React, { useCallback, useEffect, useRef } from 'react';

export type TvUploadedVideoPlayerProps = {
  src: string;
  className?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  /** Preview no modal de configuração: mantém mudo e não tenta liberar som. */
  preview?: boolean;
};

function objectFitClass(fit: TvUploadedVideoPlayerProps['objectFit']): string {
  switch (fit) {
    case 'cover':
      return 'object-cover';
    case 'fill':
      return 'object-fill';
    default:
      return 'object-contain';
  }
}

/**
 * Vídeo enviado (Storage/URL): navegadores bloqueiam autoplay com som.
 * Inicia mutado, chama play() com retentativas e tenta liberar o áudio na TV.
 */
export const TvUploadedVideoPlayer: React.FC<TvUploadedVideoPlayerProps> = ({
  src,
  className = 'h-full w-full',
  objectFit = 'contain',
  preview = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const attemptPlay = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;

    el.muted = true;
    try {
      await el.play();
    } catch {
      return;
    }

    if (preview) return;

    try {
      el.muted = false;
      await el.play();
    } catch {
      el.muted = true;
    }
  }, [preview]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onReady = () => void attemptPlay();
    el.addEventListener('canplay', onReady);
    el.addEventListener('loadeddata', onReady);

    const timers = [0, 120, 400, 1000, 2500, 5000].map((ms) =>
      window.setTimeout(() => void attemptPlay(), ms)
    );

    const onEnded = () => {
      el.currentTime = 0;
      void attemptPlay();
    };
    el.addEventListener('ended', onEnded);

    return () => {
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('loadeddata', onReady);
      el.removeEventListener('ended', onEnded);
      timers.forEach(clearTimeout);
    };
  }, [src, attemptPlay]);

  return (
    <video
      ref={videoRef}
      key={src}
      src={src}
      className={`${objectFitClass(objectFit)} ${className}`}
      playsInline
      autoPlay
      muted
      loop
      preload="auto"
      controls={false}
    />
  );
};
