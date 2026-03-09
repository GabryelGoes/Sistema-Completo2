import { useState, useEffect } from 'react';

export type Orientation = 'portrait' | 'landscape';

function getInitialOrientation(): Orientation {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return 'portrait';
    return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
  } catch {
    return 'portrait';
  }
}

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(getInitialOrientation);

  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const mediaQuery = window.matchMedia('(orientation: portrait)');
      const handleChange = (e: MediaQueryListEvent) => {
        setOrientation(e.matches ? 'portrait' : 'landscape');
      };
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
      } else {
        mediaQuery.addListener(handleChange);
      }
      return () => {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleChange);
        } else {
          mediaQuery.removeListener(handleChange);
        }
      };
    } catch {
      // ignore
    }
  }, []);

  return orientation;
}
